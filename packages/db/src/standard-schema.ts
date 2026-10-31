/**
 * The Standard Schema v1 interface (https://standardschema.dev). Zod,
 * Valibot, ArkType, and other validators implement it, so `attributes.schema`
 * accepts any of them without a dependency on one.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaProps<Input, Output>;
}

/** The `~standard` property of a {@link StandardSchemaV1}. */
export interface StandardSchemaProps<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (
    value: unknown,
  ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
  readonly types?: StandardSchemaTypes<Input, Output> | undefined;
}

export type StandardSchemaResult<Output> =
  StandardSchemaSuccess<Output> | StandardSchemaFailure;

export interface StandardSchemaSuccess<Output> {
  readonly value: Output;
  readonly issues?: undefined;
}

export interface StandardSchemaFailure {
  readonly issues: readonly StandardSchemaIssue[];
}

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?:
    readonly (PropertyKey | StandardSchemaPathSegment)[] | undefined;
}

export interface StandardSchemaPathSegment {
  readonly key: PropertyKey;
}

export interface StandardSchemaTypes<Input = unknown, Output = Input> {
  readonly input: Input;
  readonly output: Output;
}

/** Runs `schema` on `value`, whether the validator is sync or async. */
export async function validateStandardSchema<Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown,
): Promise<StandardSchemaResult<Output>> {
  return schema["~standard"].validate(value);
}

/**
 * One line for the first issue, prefixed with its dotted path when it has
 * one (`title: Required`). Fits the `VALIDATION_ERROR` `issue` param.
 */
export function formatStandardIssue(
  issues: readonly StandardSchemaIssue[],
): string {
  const [issue] = issues;
  if (!issue) return "Invalid value";
  const path = (issue.path ?? [])
    .map((segment) =>
      String(typeof segment === "object" ? segment.key : segment),
    )
    .join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
