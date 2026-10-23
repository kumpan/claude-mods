# prompt-upgrade

Asks you a few quick questions, then rewrites a short prompt into a much more detailed one you can edit, copy or run with one click.

```
/plugin install prompt-upgrade@kumpan-mods
```

## Use

```
/prompt-upgrade add a login page
```

1. A fast model (Haiku) picks the 2 to 4 questions whose answers would change the result most, and skips what your prompt already says. You answer them in the usual question dialog; dismiss it to stop asking and rewrite with what you have.
2. Sonnet rewrites your prompt, in your language, using your answers. It is told not to invent files or requirements nobody gave.
3. The result opens in a **Prompt upgrade** pane with four buttons:
   - **Run** sends it as your next prompt.
   - **Edit** puts it in the prompt box to change before sending.
   - **Copy** puts it on the clipboard.
   - **Close** dismisses the pane.

## Good to know

- Two model calls per upgrade, through your session's own credentials. The conversation is not sent: only your short prompt and your answers.
- It does not read your code, so the rewrite is as specific as your answers. Use **Edit** to add file names.
- Needs an interactive session (questions and pane): in `claude -p` the command reports the failure.
