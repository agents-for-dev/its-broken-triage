/**
 * Its-Broken Triage Agent (Router)
 *
 * This agent filters incoming Slack messages to ensure they're from #its-broken
 * BEFORE invoking any LLM. This saves costs by avoiding LLM calls for messages
 * in other channels.
 *
 * Flow:
 * 1. Extract channel ID from webhook payload
 * 2. Call Slack API to get channel name (cheap API call, no LLM)
 * 3. If channel is NOT #its-broken, return skip message
 * 4. If channel IS #its-broken, delegate to worker agent (LLM)
 */
import {
  type AgentResult,
  type Task,
  type TypedToolResult,
  agent,
  callTools,
  guildAgentTool,
  pick,
  slackTools,
} from "@guildai/agents-sdk"
import { z } from "zod"

const TARGET_CHANNEL = "its-broken"

// Tools for the router: just what we need for channel checking + the worker agent
const tools = {
  // Only need slack_get_conversation_info for channel checking
  ...pick(slackTools, ["slack_get_conversation_info"]),

  // The worker agent as a tool
  its_broken_triage_worker: guildAgentTool({
    description:
      "Performs bug triage: reads Slack thread, searches code, creates GitHub issue, replies in Slack",
    inputSchema: z.object({
      type: z.literal("text"),
      text: z.string(),
    }),
    outputSchema: z.object({
      type: z.literal("text"),
      text: z.string(),
    }),
    calls: "its-broken-triage-worker",
  }),
}
type Tools = typeof tools

const inputSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
})
type Input = z.infer<typeof inputSchema>

const outputSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
})
type Output = z.infer<typeof outputSchema>

const stateSchema = z.object({
  originalInput: z.string(),
  channelId: z.string(),
  channelName: z.string(),
  stage: z.enum(["checking_channel", "running_triage"]),
})
type State = z.infer<typeof stateSchema>

/**
 * Extract channel ID from the webhook payload in the input text.
 * The payload is embedded as JSON in the input.
 */
function extractChannelId(inputText: string): string | null {
  // Look for channel in the event object: "channel": "C1234567"
  const match = inputText.match(/"channel"\s*:\s*"([A-Z0-9]+)"/i)
  return match ? match[1] : null
}

/**
 * Start function - checks channel before invoking LLM
 */
async function start(
  input: Input,
  task: Task<Tools, State>
): Promise<AgentResult<Output, Tools>> {
  const channelId = extractChannelId(input.text)

  if (!channelId) {
    return {
      type: "output",
      output: {
        type: "text",
        text: "Could not extract channel ID from webhook payload. Skipping.",
      },
    }
  }

  // Save state and call Slack to get channel info
  await task.save({
    originalInput: input.text,
    channelId,
    channelName: "",
    stage: "checking_channel",
  })

  // Call slack_get_conversation_info to get channel details
  return callTools([
    {
      type: "tool-call",
      toolCallId: "check-channel",
      toolName: "slack_get_conversation_info",
      input: { channel: channelId },
    },
  ])
}

/**
 * Handle tool results - check channel name and decide whether to proceed
 */
async function onToolResults(
  results: Array<TypedToolResult<Tools>>,
  task: Task<Tools, State>
): Promise<AgentResult<Output, Tools>> {
  const state = await task.restore()
  if (!state) {
    return {
      type: "output",
      output: {
        type: "text",
        text: "Error: Could not restore state",
      },
    }
  }

  if (state.stage === "checking_channel") {
    // We just got the channel info back
    const channelResult = results.find(
      (r) => r.toolName === "slack_get_conversation_info"
    )

    if (!channelResult) {
      return {
        type: "output",
        output: {
          type: "text",
          text: "Error: Could not get channel info from Slack",
        },
      }
    }

    const channelInfo = channelResult.output as {
      channel?: { name?: string }
    }
    const channelName = channelInfo.channel?.name

    if (!channelName) {
      return {
        type: "output",
        output: {
          type: "text",
          text: "Error: Could not determine channel name",
        },
      }
    }

    // Check if this is the target channel
    if (channelName !== TARGET_CHANNEL) {
      return {
        type: "output",
        output: {
          type: "text",
          text: `Skipped: Message was in #${channelName}, not #${TARGET_CHANNEL}`,
        },
      }
    }

    // Channel matches! Delegate to the worker agent.
    await task.save({
      ...state,
      channelName,
      stage: "running_triage",
    })

    // Call the triage worker agent
    return callTools([
      {
        type: "tool-call",
        toolCallId: "run-triage",
        toolName: "its_broken_triage_worker",
        input: { type: "text", text: state.originalInput },
      },
    ])
  }

  if (state.stage === "running_triage") {
    // The triage worker has completed
    const triageResult = results.find(
      (r) => r.toolName === "its_broken_triage_worker"
    )

    if (!triageResult) {
      return {
        type: "output",
        output: {
          type: "text",
          text: "Error: Triage worker did not return a result",
        },
      }
    }

    const workerOutput = triageResult.output as { type: "text"; text: string }
    return {
      type: "output",
      output: {
        type: "text",
        text: workerOutput.text || "Triage completed",
      },
    }
  }

  // Shouldn't reach here
  return {
    type: "output",
    output: {
      type: "text",
      text: "Unexpected state",
    },
  }
}

export default agent({
  identifier: "its-broken-triage",
  description:
    "Triages bug reports from #its-broken Slack channel. Filters on channel name " +
    "BEFORE invoking LLM to avoid unnecessary costs. When the channel is correct, " +
    "delegates to the worker agent which investigates the report, searches code, " +
    "and creates a GitHub issue.",
  inputSchema,
  outputSchema,
  stateSchema,
  tools,
  start,
  onToolResults,
})
