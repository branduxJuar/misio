export function asDrawProof(value) {
  return /^[a-f0-9]{64}$/i.test(value?.commitment ?? '') ? value : null;
}
