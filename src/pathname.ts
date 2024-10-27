import type * as t from "ts-toolbelt";

export type ExtractPathnameParams<Path extends string> = PathnameParam<
	t.String.Split<Path, "/">[number]
>;

type PathnameParam<T extends string> = T extends `:${infer R}`
	? R
	: T extends "*"
		? "*"
		: never;

export type ConcatPathname<
	A extends string,
	B extends string,
> = `/${t.String.Join<
	t.List.Filter<[...t.String.Split<A, "/">, ...t.String.Split<B, "/">], "">,
	"/"
>}`;

export function concatPaths<BasePath extends string, Path extends string>(
	basePath: BasePath,
	path: Path,
): ConcatPathname<BasePath, Path> {
	const parts = [...basePath.split("/"), ...path.split("/")].filter(Boolean);
	return `/${parts.join("/")}` as ConcatPathname<BasePath, Path>;
}
