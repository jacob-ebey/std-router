import { beforeAll, test, vi } from "vitest";

import type {
	Middleware,
	RenderFunction,
	Renderer,
	RequestHandler,
	Route,
} from "./std-router.js";
import {
	defineContext,
	defineRoutes,
	matchRoutes,
	runMatch,
} from "./std-router.js";
import type { Extends } from "./utils.js";
import { assert } from "./utils.js";

const middlewareA: Middleware<never> = (_, n) => n();
const middlewareB: Middleware<never> = (_, n) => n();
const stringRenderer: Renderer<string> = (c, b, i) =>
	new Response(b.toString(), i);
const numberRenderer: Renderer<number> = (c, b, i) =>
	new Response(b.toString(), i);

beforeAll(async () => {
	if (typeof URLPattern === "undefined") {
		const polyfill = await import("urlpattern-polyfill");
		// @ts-ignore
		globalThis.URLPattern = polyfill.URLPattern;
	}
});

test("can define routes", ({ expect }) => {
	const routes = defineRoutes((router) =>
		router
			.use(middlewareA, middlewareB)
			.route("/a", (c) => {
				assert<Extends<typeof c.render, never>>();
				return new Response();
			})
			.renderer(numberRenderer)
			.route("/b", (c) => {
				assert<Extends<typeof c.render, RenderFunction<number>>>();
				return c.render(42);
			})
			.renderer(stringRenderer)
			.route("/", (c) => {
				assert<Extends<typeof c.render, RenderFunction<string>>>();
				return c.render("42");
			}),
	);

	assert<
		Extends<
			typeof routes,
			readonly [
				Route<"/a", Renderer<unknown>>,
				Route<"/b", Renderer<number>>,
				Route<"/", Renderer<string>>,
			]
		>
	>();

	expect(routes).toEqual([
		{
			path: "/a",
			handler: expect.any(Function),
			middleware: [{ middleware: middlewareA }, { middleware: middlewareB }],
			renderer: undefined,
		},
		{
			path: "/b",
			handler: expect.any(Function),
			middleware: [{ middleware: middlewareA }, { middleware: middlewareB }],
			renderer: numberRenderer,
		},
		{
			path: "/",
			handler: expect.any(Function),
			middleware: [{ middleware: middlewareA }, { middleware: middlewareB }],
			renderer: stringRenderer,
		},
	]);
});

test("can define routes with basePath", ({ expect }) => {
	const routes = defineRoutes(
		(router) =>
			router.route("/a", () => new Response()).route("/", () => new Response()),
		{
			basePath: "/test",
		},
	);

	assert<
		Extends<
			typeof routes,
			readonly [
				Route<"/test/a", Renderer<unknown>>,
				Route<"/test", Renderer<unknown>>,
			]
		>
	>();

	expect(routes).toEqual([
		{
			path: "/test/a",
			handler: expect.any(Function),
			middleware: [],
			renderer: undefined,
		},
		{
			path: "/test",
			handler: expect.any(Function),
			middleware: [],
			renderer: undefined,
		},
	]);
});

test("can mount routes", ({ expect }) => {
	const routes = defineRoutes((router) =>
		router.route("/a", () => new Response()).route("/", () => new Response()),
	);

	const mountedRoutes = defineRoutes((router) =>
		router.route("/b", () => new Response()).mount("/", ...routes),
	);

	assert<
		Extends<
			typeof mountedRoutes,
			readonly [
				Route<"/b", Renderer<unknown>>,
				Route<"/a", Renderer<unknown>>,
				Route<"/", Renderer<unknown>>,
			]
		>
	>();

	expect(mountedRoutes).toEqual([
		{
			path: "/b",
			handler: expect.any(Function),
			middleware: [],
			renderer: undefined,
		},
		{
			path: "/a",
			handler: expect.any(Function),
			middleware: [],
			renderer: undefined,
		},
		{
			path: "/",
			handler: expect.any(Function),
			middleware: [],
			renderer: undefined,
		},
	]);
});

test("can match routes", ({ expect }) => {
	const routes = defineRoutes((router) =>
		router
			.route("/a", () => new Response("a"))
			.route("/b", () => new Response("b"))
			.route("/c/:id?", () => new Response("c"))
			.route("/d/:id", () => new Response("d"))
			.route("/", () => new Response("root"))
			.route("*", () => new Response("catch-all")),
	);

	let match = matchRoutes(routes, new URL("https://example.com/a"));
	expect(match).toEqual({
		match: expect.any(Object),
		route: routes[0],
	});

	match = matchRoutes(routes, new URL("https://example.com/b"));
	expect(match).toEqual({
		match: expect.any(Object),
		route: routes[1],
	});

	match = matchRoutes(routes, new URL("https://example.com/c"));
	expect(match).toEqual({
		match: expect.any(Object),
		route: routes[2],
	});

	match = matchRoutes(routes, new URL("https://example.com/c/123"));
	expect(match).toEqual({
		match: expect.objectContaining({
			pathname: {
				input: "/c/123",
				groups: { id: "123" },
			},
		}),
		route: routes[2],
	});

	match = matchRoutes(routes, new URL("https://example.com/d"));
	expect(match).toEqual({
		match: expect.objectContaining({
			pathname: {
				input: "/d",
				groups: { 0: "d" },
			},
		}),
		route: routes[5],
	});

	match = matchRoutes(routes, new URL("https://example.com/d/123"));
	expect(match).toEqual({
		match: expect.objectContaining({
			pathname: {
				input: "/d/123",
				groups: { id: "123" },
			},
		}),
		route: routes[3],
	});

	match = matchRoutes(routes, new URL("https://example.com"));
	expect(match).toEqual({
		match: expect.any(Object),
		route: routes[4],
	});

	match = matchRoutes(routes, new URL("https://example.com/unknown/unknown"));
	expect(match).toEqual({
		match: expect.objectContaining({
			pathname: {
				input: "/unknown/unknown",
				groups: { 0: "unknown/unknown" },
			},
		}),
		route: routes[5],
	});
});

test("can runMatch", async ({ expect }) => {
	const middlewareA = vi.fn<Middleware<never>>((_, n) => n());
	const middlewareB = vi.fn<Middleware<never>>((_, n) => n());
	const renderer = vi.fn<Renderer<number>>(
		(c, n, i) => new Response(n.toString(), i),
	);
	const handler = vi.fn<RequestHandler<typeof numberRenderer>>(({ render }) =>
		render(42),
	);

	const routes = defineRoutes((router) =>
		router
			.use(middlewareA, middlewareB)
			.renderer(renderer)
			.route("/a", handler),
	);

	const match = matchRoutes(routes, new URL("https://example.com/a"));
	const response = await runMatch(match!, new Request("https://example.com/a"));
	expect(await response.text()).toEqual("42");

	expect(middlewareA).toHaveBeenCalledTimes(1);
	expect(middlewareB).toHaveBeenCalledTimes(1);
	expect(renderer).toHaveBeenCalledTimes(1);
	expect(handler).toHaveBeenCalledTimes(1);
});

test("can bail early from middleware", async ({ expect }) => {
	const middlewareA = vi.fn<Middleware<never>>((_, n) => n());
	const middlewareB = vi.fn<Middleware<never>>(() => new Response("b"));
	const renderer = vi.fn<Renderer<number>>(
		(c, n, i) => new Response(n.toString(), i),
	);
	const handler = vi.fn<RequestHandler<typeof renderer>>(({ render }) =>
		render(42),
	);

	const routes = defineRoutes((router) =>
		router
			.use(middlewareA, middlewareB)
			.renderer(renderer)
			.route("/a", handler),
	);

	const match = matchRoutes(routes, new URL("https://example.com/a"));
	const response = await runMatch(match!, new Request("https://example.com/a"));
	expect(await response.text()).toEqual("b");

	expect(middlewareA).toHaveBeenCalledTimes(1);
	expect(middlewareB).toHaveBeenCalledTimes(1);
	expect(renderer).toHaveBeenCalledTimes(0);
	expect(handler).toHaveBeenCalledTimes(0);
});

test("can provide context from middleware to handler", async ({ expect }) => {
	const ctx = defineContext<number>();
	const middleware = vi.fn<Middleware<any>>((c, n) => {
		c.set(ctx, 42);
		return n();
	});
	const handler = vi.fn<RequestHandler<any>>(
		(c) => new Response(c.get(ctx).toString()),
	);

	const routes = defineRoutes((router) =>
		router.use(middleware).route("/a", handler),
	);

	const match = matchRoutes(routes, new URL("https://example.com/a"));
	const response = await runMatch(match!, new Request("https://example.com/a"));
	expect(await response.text()).toEqual("42");

	expect(middleware).toHaveBeenCalledTimes(1);
	expect(handler).toHaveBeenCalledTimes(1);
});

test("can read default context value in middleware", async ({ expect }) => {
	const ctx = defineContext<number>(() => 41);
	const middleware = vi.fn<Middleware<any>>((c, n) => {
		c.set(ctx, c.get(ctx) + 1);
		return n();
	});
	const handler = vi.fn<RequestHandler<any>>(
		(c) => new Response(c.get(ctx).toString()),
	);

	const routes = defineRoutes((router) =>
		router.use(middleware).route("/a", handler),
	);

	const match = matchRoutes(routes, new URL("https://example.com/a"));
	const response = await runMatch(match!, new Request("https://example.com/a"));
	expect(await response.text()).toEqual("42");

	expect(middleware).toHaveBeenCalledTimes(1);
	expect(handler).toHaveBeenCalledTimes(1);
});

test("can read without default context value in middleware", async ({
	expect,
}) => {
	const ctx = defineContext<number>();
	const middleware = vi.fn<Middleware<any>>((c, n) => {
		c.set(ctx, (c.get(ctx, false) ?? 41) + 1);
		return n();
	});
	const handler = vi.fn<RequestHandler<any>>(
		(c) => new Response(c.get(ctx).toString()),
	);

	const routes = defineRoutes((router) =>
		router.use(middleware).route("/a", handler),
	);

	const match = matchRoutes(routes, new URL("https://example.com/a"));
	const response = await runMatch(match!, new Request("https://example.com/a"));
	expect(await response.text()).toEqual("42");

	expect(middleware).toHaveBeenCalledTimes(1);
	expect(handler).toHaveBeenCalledTimes(1);
});

test("throws without default context value", async ({ expect }) => {
	const ctx = defineContext<number>();
	const handler = vi.fn<RequestHandler<any>>(
		(c) => new Response(c.get(ctx).toString()),
	);

	const routes = defineRoutes((router) => router.route("/a", handler));

	const match = matchRoutes(routes, new URL("https://example.com/a"));
	await expect(
		runMatch(match!, new Request("https://example.com/a")),
	).rejects.toThrowError("Context not found");

	expect(handler).toHaveBeenCalledTimes(1);
});

test("can access context in renderer", async ({ expect }) => {
	const ctx = defineContext<number>();
	const middleware = vi.fn<Middleware<any>>((c, n) => {
		c.set(ctx, (c.get(ctx, false) ?? 40) + 1);
		return n();
	});
	const renderer = vi.fn<Renderer<number>>(
		(c, n, i) => new Response((n + c.get(ctx)).toString()),
	);
	const handler = vi.fn<RequestHandler<typeof renderer>>(({ render }) =>
		render(1),
	);

	const routes = defineRoutes((router) =>
		router.use(middleware).renderer(renderer).route("/a", handler),
	);

	const match = matchRoutes(routes, new URL("https://example.com/a"));
	const response = await runMatch(match!, new Request("https://example.com/a"));
	expect(await response.text()).toEqual("42");

	expect(middleware).toHaveBeenCalledTimes(1);
	expect(renderer).toHaveBeenCalledTimes(1);
	expect(handler).toHaveBeenCalledTimes(1);
});

test("can mount middleware", async ({ expect }) => {
	const ctx = defineContext<number>();
	const middleware = vi.fn<Middleware<any>>((c, n) => {
		c.set(ctx, (c.get(ctx, false) ?? 40) + 1);
		return n();
	});
	const renderer = vi.fn<Renderer<number>>(
		(c, n, i) => new Response((n + c.get(ctx)).toString()),
	);
	const handler = vi.fn<RequestHandler<typeof renderer>>(({ render }) =>
		render(1),
	);

	const routes = defineRoutes((router) =>
		router.use(middleware).renderer(renderer).route("/a", handler),
	);

	const mountedRoutes = defineRoutes((router) =>
		router.mount("/test", ...routes),
	);

	const match = matchRoutes(
		mountedRoutes,
		new URL("https://example.com/test/a"),
	);
	const response = await runMatch(
		match!,
		new Request("https://example.com/test/a"),
	);
	expect(await response.text()).toEqual("42");

	expect(middleware).toHaveBeenCalledTimes(1);
	expect(renderer).toHaveBeenCalledTimes(1);
	expect(handler).toHaveBeenCalledTimes(1);
});

test("can forward middleware to mount", async ({ expect }) => {
	const ctx = defineContext<number>();
	const middleware = vi.fn<Middleware<any>>((c, n) => {
		c.set(ctx, (c.get(ctx, false) ?? 40) + 1);
		return n();
	});
	const renderer = vi.fn<Renderer<number>>(
		(c, n, i) => new Response((n + c.get(ctx)).toString()),
	);
	const handler = vi.fn<RequestHandler<typeof renderer>>(({ render }) =>
		render(1),
	);

	const routes = defineRoutes((router) =>
		router.renderer(renderer).route("/a", handler),
	);

	const mountedRoutes = defineRoutes((router) =>
		router.use(middleware).mount("/test", ...routes),
	);

	const match = matchRoutes(
		mountedRoutes,
		new URL("https://example.com/test/a"),
	);
	const response = await runMatch(
		match!,
		new Request("https://example.com/test/a"),
	);
	expect(await response.text()).toEqual("42");

	expect(middleware).toHaveBeenCalledTimes(1);
	expect(renderer).toHaveBeenCalledTimes(1);
	expect(handler).toHaveBeenCalledTimes(1);
});
