# Migrating from 1.x to 2.0

Version 2 is an intentional breaking security and protocol release.

## Required changes

1. Install Node.js 22 or 24 LTS.
2. Upgrade the MCP host to one supporting MCP `2026-07-28`.
3. Replace positional vault paths with `serve --vault id=/absolute/path` arguments.
4. Update stored prompts and calls to the new prefixed snake_case tool names and fields.

| 1.x                        | 2.0                         |
| -------------------------- | --------------------------- |
| `list-available-vaults`    | `obsidian_list_vaults`      |
| `read-note`                | `obsidian_read_note`        |
| `create-note`              | `obsidian_create_note`      |
| `edit-note`                | `obsidian_edit_note`        |
| `delete-note`              | `obsidian_delete_note`      |
| `move-note`                | `obsidian_move_note`        |
| `create-directory`         | `obsidian_create_directory` |
| `search-vault`             | `obsidian_search_vault`     |
| `add-tags`                 | `obsidian_add_tags`         |
| `remove-tags`              | `obsidian_remove_tags`      |
| `rename-tag`               | `obsidian_rename_tag`       |
| unregistered `manage-tags` | `obsidian_manage_tags`      |

Note tools now use one relative `path` instead of separate filename/folder values. `edit-note` no longer accepts a hidden delete operation; use `obsidian_delete_note`. Search uses explicit `mode`, `limit`, and cursor fields. Tool results now include structured content and machine-readable errors.

## Recovery changes

Version 2 uses `.obsidian-mcp` for transaction journals and MCP trash. It does not automatically modify or delete legacy `.backup` or `.trash` directories. Those directories are excluded from v2 scans and can be archived or removed manually after verifying their contents.

Version 1.x is deprecated and receives no compatibility bridge. Upgrade promptly because its vault-containment implementation can permit access outside configured roots.
