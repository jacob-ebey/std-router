import type { Context } from "./context.js";
import type { ConcatPathname } from "./pathname.js";
import { concatPaths } from "./pathname.js";

export type { Context } from "./context.js";
export { defineContext } from "./context.js";
export type { ConcatPathname, ExtractPathnameParams } from "./pathname.js";
export { concatPaths } from "./pathname.js";

export interface Route<Path extends string, RendererImp extends Renderer<any>> {
	path: Path;
	handler: RequestHandler<RendererImp>;
	middleware: ReadonlyArray<BoundMiddleware>;
	renderer: RendererImp;
}

type AnyRoute = Route<any, any>;
type AnyRouter = Router<any, any, any>;

export type RenderFunction<Body> = (
	body: Body,
	init?: ResponseInit,
) => Promise<Response> | Response;

type RequestContext<RendererImp extends Renderer<any>> = {
	request: Request;
	get<T>(context: Context<T>, required: false): T | undefined;
	get<T>(context: Context<T>, required?: boolean): T;
	set<T>(context: Context<T>, value: T): void;
	render: RendererImp extends Renderer<infer Body>
		? RenderFunction<Body>
		: never;
};

export type Middleware<RendererImp extends Renderer<any>> = (
	c: RequestContext<RendererImp>,
	next: (request?: Request) => Promise<Response> | Response,
) => Promise<Response> | Response;

export type RequestHandler<RendererImp extends Renderer<any>> = (
	c: RequestContext<RendererImp>,
) => Promise<Response> | Response;

export type Renderer<Body> = (
	c: RequestContext<never>,
	body: Body,
	init?: ResponseInit,
) => Promise<Response> | Response;

type BoundMiddleware = {
	middleware: Middleware<any>;
	renderer: Renderer<any>;
};

export class Router<
	const BasePath extends string,
	const BaseRenderer extends Renderer<any>,
	const Routes extends ReadonlyArray<AnyRoute>,
> {
	constructor(
		private basePath: BasePath,
		private baseMiddleware: ReadonlyArray<BoundMiddleware>,
		private baseRenderer: BaseRenderer,
		public routes: Routes,
	) {
		baseMiddleware;
	}

	mount<const MountRoutes extends ReadonlyArray<AnyRoute>>(
		path: string,
		...routes: MountRoutes
	) {
		return new Router<
			BasePath,
			BaseRenderer,
			readonly [...Routes, ...MountRoutes]
		>(this.basePath, this.baseMiddleware, this.baseRenderer, [
			...this.routes,
			...(routes.map((route: AnyRoute) => ({
				...route,
				path: concatPaths(concatPaths(this.basePath, path), route.path),
			})) as unknown as MountRoutes),
		]);
	}

	renderer<RendererImplementation extends Renderer<any>>(
		renderer: RendererImplementation,
	) {
		return new Router<BasePath, RendererImplementation, Routes>(
			this.basePath,
			this.baseMiddleware,
			renderer,
			this.routes,
		);
	}

	route<const Path extends string>(
		path: Path,
		handler:
			| RequestHandler<BaseRenderer>
			| (() => Promise<{ default: RequestHandler<BaseRenderer> }>)
			| (() => { default: RequestHandler<BaseRenderer> })
			| (() => Promise<{ handler: RequestHandler<BaseRenderer> }>)
			| (() => { handler: RequestHandler<BaseRenderer> }),
	) {
		const newRoute = {
			path: concatPaths(this.basePath, path),
			handler: async (c) => {
				const handlerResult = await handler(c);
				const mod =
					"default" in handlerResult
						? handlerResult.default
						: "handler" in handlerResult
							? handlerResult.handler
							: null;

				if (mod == null) {
					return handlerResult as Response;
				}

				return mod(c);
			},
			middleware: this.baseMiddleware,
			renderer: this.baseRenderer,
		} satisfies Route<ConcatPathname<BasePath, Path>, BaseRenderer>;

		return new Router<
			BasePath,
			BaseRenderer,
			readonly [...Routes, Route<ConcatPathname<BasePath, Path>, BaseRenderer>]
		>(this.basePath, this.baseMiddleware, this.baseRenderer, [
			...this.routes,
			newRoute,
		]);
	}

	use(...middleware: Middleware<BaseRenderer>[]) {
		return new Router<BasePath, BaseRenderer, Routes>(
			this.basePath,
			[
				...this.baseMiddleware,
				...middleware.map<BoundMiddleware>((m) => ({
					middleware: m,
					renderer: this.baseRenderer as Renderer<any>,
				})),
			],
			this.baseRenderer,
			this.routes,
		);
	}
}

export function defineRoutes<
	const RoutesRouter extends AnyRouter,
	const BaseRenderer extends Renderer<any> = never,
	const BasePath extends string = "/",
>(
	callback: (
		router: Router<BasePath, BaseRenderer, readonly []>,
	) => RoutesRouter,
	{
		basePath,
		middleware,
		renderer,
	}: {
		basePath?: BasePath;
		middleware?: Middleware<any>[];
		renderer?: BaseRenderer;
	} = {},
): RoutesRouter["routes"] {
	return callback(
		new Router<BasePath, BaseRenderer, readonly []>(
			(basePath ?? "/") as BasePath,
			(middleware?.map((middleware) => ({
				middleware,
				renderer,
			})) ?? []) as ReadonlyArray<BoundMiddleware>,
			renderer as BaseRenderer,
			[],
		),
	).routes;
}

export type RouteMatch = {
	match: URLPatternResult;
	route: AnyRoute;
};

const patternCache = new WeakMap<AnyRoute, URLPattern>();
export function matchRoutes(
	routes: ReadonlyArray<AnyRoute>,
	url: URL,
): RouteMatch | null {
	for (const route of routes) {
		let pattern = patternCache.get(route);
		if (pattern == null) {
			pattern = new URLPattern({ pathname: route.path });
			patternCache.set(route, pattern);
		}
		const match = pattern.exec({ pathname: url.pathname });
		if (match == null) continue;

		return {
			match,
			route,
		};
	}

	return null;
}

export async function runMatch(match: RouteMatch, request: Request) {
	const contextCache = new WeakMap<Context<any>, any>();

	const context: RequestContext<any> = {
		render: (value, init) => match.route.renderer(context, value, init),
		request,
		get(context, required = true) {
			if (contextCache.has(context)) {
				return contextCache.get(context);
			}
			if ("defaultValue" in context) {
				return context.defaultValue();
			}
			if (required) {
				throw new Error("Context not found");
			}
			return undefined;
		},
		set(context, value) {
			contextCache.set(context, value);
		},
	};

	let next: (request?: Request) => Promise<Response> | Response = () =>
		match.route.handler({
			...context,
			request: request ?? context.request,
		});
	for (let i = match.route.middleware.length - 1; i >= 0; i--) {
		const middleware = match.route.middleware[i];
		const previousNext = next;
		next = (request?: Request) =>
			middleware.middleware(
				{
					...context,
					request: request ?? context.request,
					render: (value, init) =>
						middleware.renderer(
							{
								...context,
								render: undefined as never,
								request: request ?? context.request,
							},
							value,
							init,
						),
				},
				previousNext,
			);
	}

	return next();
}
