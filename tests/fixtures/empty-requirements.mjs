// Older root-flow cases have no saved requirement. New persistence is tested separately.
export async function emptyRequirements(context) {
  await context.route('**/api/scene-requirements*', route => {
    if (route.request().method() !== 'GET') throw new Error('This entry case must not save a requirement.');
    return route.fulfill({ json: { requirement: null } });
  });
}
