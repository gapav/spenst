#!/usr/bin/env bash
# Copied from Grep (.github/scripts/project-status.sh), unchanged.
# Set the board Status of an issue's card: project-status.sh <issue-number> <status>
# Finds the card through the issue itself (any project it is on that has a
# Status field with that option), so no project or field ids are hard-coded.
# Needs GH_TOKEN with access to the project (a classic token with `project`
# and `repo`): the workflow's own token cannot reach a user-owned project.
set -euo pipefail
issue=$1
status=$2
owner=${GITHUB_REPOSITORY%/*}
repo=${GITHUB_REPOSITORY#*/}

items=$(gh api graphql -F owner="$owner" -F repo="$repo" -F num="$issue" -f query='
  query($owner: String!, $repo: String!, $num: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $num) {
        projectItems(first: 10) {
          nodes {
            id
            project {
              id
              title
              field(name: "Status") {
                ... on ProjectV2SingleSelectField { id options { id name } }
              }
            }
          }
        }
      }
    }
  }' --jq '.data.repository.issue.projectItems.nodes[]
    | select(.project.field != null)
    | [.id, .project.id, .project.title, .project.field.id,
       ((.project.field.options[] | select(.name == "'"$status"'") | .id) // "")]
    | @tsv')

if [ -z "$items" ]; then
  echo "Issue #$issue is on no project with a Status field; nothing to move."
  exit 0
fi

while IFS=$'\t' read -r item project title field option; do
  if [ -z "$option" ]; then
    echo "Project \"$title\" has no Status \"$status\"; skipped."
    continue
  fi
  gh api graphql -F project="$project" -F item="$item" -F field="$field" -F option="$option" -f query='
    mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $project, itemId: $item, fieldId: $field,
        value: { singleSelectOptionId: $option }
      }) { projectV2Item { id } }
    }' > /dev/null
  echo "Issue #$issue → \"$status\" on \"$title\"."
done <<< "$items"
