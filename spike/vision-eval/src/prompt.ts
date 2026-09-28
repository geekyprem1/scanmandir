// Evaluate the exact prompt used by the running backend. A local copy drifted at v1
// while production moved to v2, making a repeat evaluation misleading.
export {
  PROMPT_VERSION,
  SCHEMA_VERSION,
  SYSTEM_PROMPT,
  USER_PROMPT,
} from '../../../backend/src/modules/vision/prompt.js';
