# std-router

A simple server router with support for middleware, context, and renderers.

## Defining routes

Here we define a few routes and a custom React renderer with support for shared layouts.

```tsx
import { defineRoutes } from "std-router";
import { renderToReadableStream } from "react-dom/server.edge";

export const routes = defineRoutes((router) =>
  router
    .renderer(reactRenderer)
    .use(reactLayout(Shell))
    .route("/", (c) => c.render(<Home />))
    .route("*", (c) => c.render(<NotFound />, { status: 404 }))
);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <title>Hello, World</title>
      </head>
      <body>{children}</body>
    </html>
  );
}

function Home() {
  return <h1>Hello, World</h1>;
}

function NotFound() {
  return <h1>Not Found</h1>;
}

type LayoutComponent = (props: {
  children?: React.ReactNode;
}) => React.ReactNode;

const rendererContext = defineContext<LayoutComponent[]>(() => []);

const reactLayout =
  (Layout: LayoutComponent): Middleware<any> =>
  (c, next) => {
    c.set(rendererContext, [...c.get(rendererContext), Layout]);
    return next();
  };

const reactRenderer: Renderer<React.ReactNode> = (c, node, init) => {
  const body = await renderToReadableStream(node, {
    onError: console.error,
  });

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "text/html; charset=utf8");

  return new Response(body, { ...init, headers });
};
```

## Matching and running routes

Here we use our defined routes and match against them. If we find a match, we run it against the request and return the response.

```ts
import { matchRoutes, runMatch } from "std-router";

import { routes } from "./routes.js";

export function handleRequest(request: Request) {
  const match = matchRoutes(routes, new URL(request.url));
  if (!match) {
    return new Response("Not Found", { status: 404 });
  }

  return runMatch(match, request);
}
```
