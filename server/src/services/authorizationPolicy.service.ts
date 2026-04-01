import { buildAuthorizationCatalog } from '../config/authorizationCatalog';
import { buildAuthorizationPolicyDocument } from '../config/authorizationPolicy';
import { getWorkflowConfigSnapshot } from './workflowConfig.service';

export function getAuthorizationDefinitionSnapshot() {
  return {
    catalog: buildAuthorizationCatalog(),
    policy: buildAuthorizationPolicyDocument(),
  };
}

export async function getAuthorizationRuntimeSnapshot(options?: { forceRefresh?: boolean }) {
  const workflow = await getWorkflowConfigSnapshot({ forceRefresh: options?.forceRefresh });
  return {
    ...getAuthorizationDefinitionSnapshot(),
    workflow,
  };
}
