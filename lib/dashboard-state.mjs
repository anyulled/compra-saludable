export function profileObjectivesComplete(profile) {
  return profile.calories > 0 && profile.protein > 0 && profile.carbs > 0 && profile.fat > 0;
}

export function withPlanLock(state, day, meal, recipeId) {
  return {
    ...state,
    planLocks: [
      ...(state.planLocks || []).filter((lock) => lock.day !== day || lock.meal !== meal),
      ...(recipeId ? [{ day, meal, recipeId }] : []),
    ],
    planDirty: true,
    confirmed: false,
  };
}

export function withShoppingCheck(state, itemId, checked) {
  return {
    ...state,
    shopping: state.shopping.map((item) => item.id === itemId ? { ...item, checked } : item),
  };
}
