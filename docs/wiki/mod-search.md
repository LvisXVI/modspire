# Mod search and pack selection

## Standard search

The catalog view searches Modrinth by default. Search by mod title or terms, then refine with version, loader, category, and catalog controls. Results are paged as the list is scrolled; the catalog may have fewer results than the query suggests because filters and catalog availability apply.

CurseForge search is optional and requires the user's own approved CurseForge API key. Without it the app falls back to Modrinth where possible.

## AI-assisted search

Describe the feature or name the mod in chat. The assistant uses the active pack, selected game version, loader, and already selected mods as context. The app parses search intent and opens selectable catalog results; results should not rely on a model making a special tool call. Exact matches are preferred for exact requests; when no definitive match exists, related alternatives can be offered.

Use follow-up buttons such as **Mehr Erkundung**, **Alternativen**, or **Visual-Mods** to refine the current request. Buttons submit a chat request. Suggestions already in the pack are filtered out, and ranking controls can prioritize relevance or downloads.

## Add and remove

- Click a result card or its plus control to add it directly.
- Click the minus control on a selected result to remove it.
- Use the pack tray to review, filter, copy, export, or clear the selection.
- Dependencies may be suggested or added according to the current flow; review the final list.

Catalog descriptions, compatibility, and download counts come from external services and can change. A matching search result is not a guarantee that the mod works in game.
