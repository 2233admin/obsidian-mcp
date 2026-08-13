# Tool examples

## Read with revision protection

```json
{ "vault": "work", "path": "Projects/Plan.md" }
```

Use the returned `etag` when editing:

```json
{
  "vault": "work",
  "path": "Projects/Plan.md",
  "operation": "append",
  "content": "\nNext step\n",
  "if_match": "<sha256-etag>"
}
```

## Paginated search

```json
{
  "vault": "work",
  "query": "project/active",
  "mode": "tag",
  "limit": 50
}
```

Repeat the same call with `cursor` set to `next_cursor` until `has_more` is false.

## Transactional tag rename

```json
{
  "vault": "work",
  "old_tag": "status/active",
  "new_tag": "status/current",
  "location": "both",
  "include_children": true
}
```

All affected notes commit together or are restored together.
