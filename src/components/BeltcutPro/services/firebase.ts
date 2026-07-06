// REST API client for Beltcut Pro database operations
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// Error handling helper
export function handleApiError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`API Error during ${operationType} on ${path}: `, message);
  throw new Error(message);
}

// Fetch all rolls alongside their nested cuts
export const fetchRolls = async () => {
  try {
    const response = await fetch('/api/rolls');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    handleApiError(error, OperationType.LIST, 'rolls');
  }
};

// Save a new master roll
export const saveRoll = async (roll: any) => {
  try {
    const response = await fetch('/api/rolls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(roll),
    });
    if (!response.ok) {
      let errMsg = `HTTP error! status: ${response.status}`;
      try {
        const errData = await response.json();
        if (errData && errData.error) errMsg = errData.error;
      } catch (_) {}
      throw new Error(errMsg);
    }
    return await response.json();
  } catch (error) {
    handleApiError(error, OperationType.WRITE, `rolls/${roll.id}`);
  }
};

// Update remaining area of a roll
export const updateRoll = async (rollId: string, data: any) => {
  try {
    const response = await fetch(`/api/rolls/${encodeURIComponent(rollId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    handleApiError(error, OperationType.UPDATE, `rolls/${rollId}`);
  }
};

// Delete a roll
export const deleteRoll = async (rollId: string) => {
  try {
    const response = await fetch(`/api/rolls/${encodeURIComponent(rollId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    handleApiError(error, OperationType.DELETE, `rolls/${rollId}`);
  }
};

// Save cutting placement record
export const saveCut = async (rollId: string, cut: any) => {
  try {
    const response = await fetch(`/api/rolls/${encodeURIComponent(rollId)}/cuts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cut),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    handleApiError(error, OperationType.WRITE, `rolls/${rollId}/cuts/${cut.id}`);
  }
};

// Delete cutting placement record
export const deleteCut = async (rollId: string, cutId: string) => {
  try {
    const response = await fetch(`/api/rolls/${encodeURIComponent(rollId)}/cuts/${encodeURIComponent(cutId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    handleApiError(error, OperationType.DELETE, `rolls/${rollId}/cuts/${cutId}`);
  }
};
