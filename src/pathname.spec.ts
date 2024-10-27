import { expect, test } from "vitest";

import type { ConcatPathname, ExtractPathnameParams } from "./pathname.js";
import { concatPaths } from "./pathname.js";
import type { Extends } from "./utils.js";
import { assert } from "./utils.js";

function assertExtends<const A extends string, const B extends string>(
	a: A,
	b: B,
	e: ConcatPathname<A, B>,
) {
	expect(concatPaths(a, b)).toEqual(e);
}

test("Can concat pathnames", () => {
	assertExtends("a", "b", "/a/b");
	assertExtends("/a", "/b", "/a/b");
	assertExtends("/a/", "/b", "/a/b");
	assertExtends("/a", "/b/", "/a/b");
	assertExtends("/a/", "/b/", "/a/b");
	assertExtends("a/", "/b/", "/a/b");
	assertExtends("/a/", "b/", "/a/b");
	assertExtends("a/", "b/", "/a/b");
	assertExtends("a", "b", "/a/b");
	assertExtends("a/b", "c", "/a/b/c");
});

// Can extract pathname params
test("Can concat pathnames", () => {
	assert<Extends<ExtractPathnameParams<"/id">, never>>();
	assert<Extends<ExtractPathnameParams<"/:id">, "id">>();
	assert<Extends<ExtractPathnameParams<"/:id1/:id2">, "id1" | "id2">>();
	assert<Extends<ExtractPathnameParams<"/:id?">, "id?">>();
	assert<Extends<ExtractPathnameParams<"/:id1?/:id2?">, "id1?" | "id2?">>();
	assert<Extends<ExtractPathnameParams<"/:id1/:id2?">, "id1" | "id2?">>();
	assert<Extends<ExtractPathnameParams<"/*">, "*">>();
	assert<Extends<ExtractPathnameParams<"/:id/*">, "id" | "*">>();
	assert<Extends<ExtractPathnameParams<"/:id/:id2?/*">, "id" | "id2?" | "*">>();
});
