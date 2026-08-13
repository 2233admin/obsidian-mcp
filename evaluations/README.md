# Read-only evaluation fixture

`fixture-vault` is a small immutable Obsidian vault used by `read-only.xml`. Build the server and configure it as:

```bash
node dist/main.js serve --vault fixture-vault=/absolute/path/to/evaluations/fixture-vault
```

The ten evaluation questions require only `obsidian_list_vaults`, `obsidian_search_vault`, and `obsidian_read_note`. Answers are tied to the checked-in historical fixture and are validated structurally by `npm run eval:validate`.
