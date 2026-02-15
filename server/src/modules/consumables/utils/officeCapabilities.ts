type OfficeLike = {
  type?: string;
  capabilities?: {
    moveables?: boolean;
    consumables?: boolean;
    chemicals?: boolean;
  };
};

export function supportsChemicals(office: OfficeLike | null | undefined) {
  if (!office) return false;
  if (office.capabilities && typeof office.capabilities.chemicals === 'boolean') {
    return office.capabilities.chemicals;
  }
  return office.type === 'DISTRICT_LAB';
}

export function supportsConsumables(office: OfficeLike | null | undefined) {
  if (!office) return false;
  if (office.capabilities && typeof office.capabilities.consumables === 'boolean') {
    return office.capabilities.consumables;
  }
  return true;
}

export function supportsMoveables(office: OfficeLike | null | undefined) {
  if (!office) return false;
  if (office.capabilities && typeof office.capabilities.moveables === 'boolean') {
    return office.capabilities.moveables;
  }
  return true;
}
