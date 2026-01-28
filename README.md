# its-broken-triage

Automates initial triage of bug reports from the #its-broken Slack channel.

## What it does

When @mentioned in a Slack thread in #its-broken:

1. Reads the thread to understand the bug report
2. Searches guildaidev/guildcode for relevant code
3. Analyzes and hypothesizes the root cause
4. Creates a GitHub issue with findings
5. Replies in Slack with the issue link

## Tools

- **Slack**: Read threads, post replies, get user info
- **GitHub**: Search code, read files, create issues

## Setup Instructions

### 1. Import the Agent

From the Guild CLI:

```bash
guild agent import agents-for-dev/its-broken-triage
```

Or use the web UI:
1. Go to https://shared.guildai.dev/agents
2. Click "Import Agent"
3. Enter: `agents-for-dev/its-broken-triage`

### 2. Configure Slack Webhook

After importing, you need to activate the Slack webhook so the agent responds to @mentions.

**In the Guild Web UI:**

1. Navigate to your workspace settings
2. Go to **Integrations** > **Slack**
3. Ensure Guild is installed in your Slack workspace
4. Go to **Webhooks** or **Agent Triggers**
5. Create a new trigger:
   - **Agent**: its-broken-triage
   - **Trigger type**: App mention
   - **Channel filter**: #its-broken (optional, but recommended)
6. Save the webhook

**Alternative: Via Guild CLI:**

```bash
# List available webhooks
guild webhooks list

# Create a webhook for app mentions
guild webhooks create \
  --agent its-broken-triage \
  --trigger app_mention \
  --channel its-broken
```

### 3. Verify Credentials

The agent needs access to:

- **Slack**: Should be automatic if Guild Slack app is installed
- **GitHub**: May need to configure via Guild credentials

Test by @mentioning Guild in a test thread in #its-broken.

### 4. Test the Agent

1. Create a test thread in #its-broken with a sample bug report
2. @mention Guild in the thread: `@Guild please triage this`
3. The agent should:
   - Acknowledge with a reaction or message
   - Search for relevant code
   - Create a GitHub issue
   - Reply with the issue link

## Example Usage

**In Slack (#its-broken):**

```
User: Getting a 500 error when I try to save an agent version.
      Error: "Cannot read property 'id' of undefined"

User: @Guild can you triage this?

Guild: Looking into this bug report...

Guild: Created GitHub issue: https://github.com/guildaidev/guildcode/issues/1234

       Summary: Found error originates from agents.py:356 where version.id
       is accessed before null check. Likely triggered when saveVersion
       is called before agent reaches READY state.
```

## Configuration

The agent targets `guildaidev/guildcode` by default. To change:

1. Edit the systemPrompt in `agent.ts`
2. Update the repository references

## Troubleshooting

**Agent doesn't respond:**
- Check webhook is active in workspace settings
- Verify Guild Slack app is in the channel
- Check agent logs in Guild dashboard

**GitHub 403 errors:**
- Agent will prompt for credentials via `guild_credentials_request`
- Configure GitHub OAuth in Guild workspace settings

**Missing Slack messages:**
- Ensure bot has access to the channel
- Check Slack app permissions include reading messages

## Development

```bash
# Install dependencies
npm install

# Type check
npx tsc --noEmit
```
