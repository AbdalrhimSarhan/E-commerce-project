/**
 * Password rule for registration and seeded accounts: 8-72 characters with at
 * least one letter and one digit. 72 is bcrypt's input limit; anything longer
 * would be silently truncated, so it is rejected instead.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

export const PASSWORD_RULE_MESSAGE =
  'password must be 8-72 characters and contain at least one letter and one digit';
