/**
 * Runs every test outside UTC, which CI hosts are not, so a timestamp that
 * shifts with the process time zone fails there too. Asia/Tehran has a
 * half-hour offset.
 */
// eslint-disable-next-line turbo/no-undeclared-env-vars -- this sets TZ, so the host's TZ never reaches a test result
process.env.TZ = "Asia/Tehran";
