# Marty's Journal

## 2026-04-01 - Navigation Utility Plural Route Matching and Safe Inputs **Learning:** `getBoardId` and `getParentPath` in `frontend/src/utils/Navigation.js` assumed `/board/` singular routing and non-null string inputs. Supporting `/boards/` plural routes along with non-string type guards prevents unexpected runtime exceptions when navigating or checking headers. **Action:** Ensure routing helpers gracefully handle both route variations and non-string inputs.
