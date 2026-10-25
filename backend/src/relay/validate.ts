export class RelayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// TODO(stellar), task 5: validate the member's transaction (allowed contract + functions, source account
// belongs to the user, simulate) before wrapping it in a FeeBumpTransaction signed by the sponsor.
