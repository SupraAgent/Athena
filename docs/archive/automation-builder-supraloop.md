# @supra/automation-builder

This app uses the shared visual workflow builder package from:

**Source repo:** https://github.com/SupraAgent/Supra-Automation-Builder

**Full integration guide:** `node_modules/@supra/automation-builder/INTEGRATION.md`

Or view it on GitHub: https://github.com/SupraAgent/Supra-Automation-Builder/blob/main/INTEGRATION.md

## Updating

```bash
npm install github:SupraAgent/Supra-Automation-Builder
```

## SupraLoop-specific setup

* **Registry:** domain-specific nodes (PersonaNode, ConsensusNode, StepNode) passed as customNodeTypes to FlowCanvas
* **Persistence:** localStorage via `TemplatePersistence("supraloop_custom_templates")`
* **Tailwind:** v4, using `@source` directive in `globals.css`
* **Undo/Redo:** imported from shared package (`useUndoRedo`)
