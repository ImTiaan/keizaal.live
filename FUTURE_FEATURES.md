# Future Features Roadmap

## Native Multistream Hub (Keizaal Multi-Viewer)

Instead of sending users off-site to MultiTwitch or Kadgar, build a native multistream viewing experience directly into `keizaal.live`.

**Key Requirements:**
1. **Twitch OAuth Integration:** Allow users to log in with their Twitch accounts to bypass embedded player restrictions or interact with chat natively.
2. **On-Site Theater Mode:** Create a `/multistream` route that dynamically tiles 2–4 selected Twitch iframe embeds on a single screen.
3. **Stream Selector:** Add checkboxes or a "Add to Multistream" button on the main directory grid so users can build their own viewing layouts.
4. **Saved Layouts / Groups:** Allow authenticated users to save their favorite groups of streamers (e.g., "PD Command", "The Criminals", "Civilians") for one-click access next time they visit.
5. **Chat Integration:** Include a tabbed or side-by-side chat window that lets the user toggle between the chats of the streams they are currently watching.

*Note: This requires careful handling of Twitch's embedding policies (parent domain requirements) and managing browser memory so multiple video players don't crash lower-end devices.*
