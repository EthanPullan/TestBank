// ---------------------------------------------------------------------------
// Deployment / moderation configuration.
//
// Submitted questions are filed as GitHub issues in this repository, where the
// maintainer reviews them. Approving a suggestion (in the Settings → Moderation
// panel, or by importing the issue JSON) adds it to the local bank; publishing
// it to every visitor means committing it to public/seed-questions.json.
// ---------------------------------------------------------------------------

export const GITHUB_OWNER = "EthanPullan";
export const GITHUB_REPO = "TestBank";

// Issues opened by the "Suggest a question" form get this label so they are
// easy to find. (Create the label in the repo so it is applied automatically.)
export const SUBMISSION_LABEL = "question-submission";

// Passphrase that unlocks the in-app moderation queue (Settings tab).
// It only hides the approve/reject controls from casual visitors — approving a
// suggestion only ever changes the maintainer's own browser copy until they
// publish it — so this is convenience, not real security. Change it and
// redeploy to rotate it.
export const ADMIN_PASSPHRASE = "approve";
