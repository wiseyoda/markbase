# Backlog

## Real-time comments
Comments currently require a page refresh to see new ones from other users.
Options: WebSocket, SSE, or polling interval.

## Notifications
Notify doc owner when new comments are added to their shared files.
Options: Email, in-app notification bell, Slack webhook.

## GitHub webhooks for cache invalidation
Listen for push events to invalidate cached file trees and content.
Currently using `revalidate: 60` on fetch calls.

## User management
Proper user table with profile, preferences, settings.
Currently relying entirely on GitHub session.

## Search
Full-text search across synced repo markdown files.
