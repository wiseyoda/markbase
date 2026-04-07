# Backlog

## High Priority

### Real-time comments
Comments require a page refresh to see new ones from other users.
Options: WebSocket, SSE, or polling interval (simplest: 10s poll).

### Share scope upgrade
Allow upgrading a share in-place (file -> folder -> repo) without delete + recreate.
UX: "Edit" button on shares management page that reopens the share dialog.

### Comment limit investigation
A user reported being unable to add more than 5 comments. No code limit exists.
Investigate: could be selection detection issue, or server action silently failing.

## Medium Priority

### Notifications
Notify doc owner when new comments are added to their shared files.
Options: Email, in-app notification bell, Slack webhook.

### GitHub webhooks for cache invalidation
Listen for push events to invalidate cached file trees and content.
Currently using `revalidate: 60` on fetch calls. Would make content appear instantly.

### Search
Full-text search across synced repo markdown files.
Could index content in Postgres or use a search service.

### Light mode polish
Dark mode is the primary design. Light mode has basic overrides but hasn't been
tested or polished to the same degree.

## Low Priority

### Comment highlight flash
Highlights are DOM mutations applied via useEffect. They flash briefly on
React re-renders before being re-applied. Could be fixed with a stable
highlight mechanism (CSS custom highlight API or pre-processing).

### Mobile responsiveness
Sidebar has a mobile drawer toggle but the overall layout hasn't been
tested on mobile. Comment rail likely needs mobile-specific UX.

### Performance
- Comment count query uses `LIKE` prefix match — add proper index
- File tree fetch for large repos (400+ files) is slow — consider pagination
- History panel fetches file content for each commit click — consider caching
