"use strict";

// Read-only live evidence: the 2026-03-10 branch-rule API needs Metadata: read.
// https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch
async function collectApiEvidence({ github, context }) {
  const rules = await github.paginate(github.rest.repos.getBranchRules, {
    ...context.repo, branch: "main", per_page: 100,
    headers: { "X-GitHub-Api-Version": "2026-03-10" },
  });
  if (!rules.some((rule) => rule.type === "required_status_checks")) {
    throw new Error("Expected protected main-branch status rules");
  }
  const schema = await github.graphql('query { __type(name: "EnablePullRequestAutoMergeInput") { inputFields { name } } }');
  const fields = schema.__type.inputFields.map((field) => field.name);
  if (!fields.includes("expectedHeadOid")) throw new Error("Native auto-merge schema lacks expectedHeadOid");
  return {
    api_version: "2026-03-10",
    branch_rules_read_with_workflow_token: "success",
    rule_types: rules.map((rule) => rule.type),
    auto_merge_input_fields: fields,
    note: "Live API reads with this job's GITHUB_TOKEN; no administrator token or merge mutation was used.",
  };
}

module.exports = { collectApiEvidence };
