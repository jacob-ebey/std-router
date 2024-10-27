export type Context<T> =
	| {
			defaultValue: () => T;
	  }
	| {};

export function defineContext<T>(): Context<T>;
export function defineContext<T>(defaultValue: () => T): Context<T>;
export function defineContext<T>(
	defaultValue?: () => T,
): Context<T | undefined> {
	if (arguments.length === 0) {
		return {};
	}
	return { defaultValue };
}
