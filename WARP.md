# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- rs-core is a Deno + TypeScript library providing the core primitives for the rs-runtime (Restspace) runtime. It exposes HTTP message abstractions, URL/path utilities, a service router, adapter interfaces, streaming helpers, and state/pipeline primitives.
- Key configs: deno.json (import map), deno.lock. Tests live under test/.
- Note: deno.json maps "@workingdevshero/deno-imap" to ../deno-imap. Ensure that sibling repo exists at that path (or update the import map) for local development.

Commands
- Test (all)
```bash path=null start=null
deno test --unstable --allow-all test/
```
- Test a single file
```bash path=null start=null
deno test --unstable --allow-all test/Url.test.ts
```
- Test by name (substring match)
```bash path=null start=null
deno test --unstable --allow-all --filter "Url.fromPath" test/Url.test.ts
```
- Watch tests on change
```bash path=null start=null
deno test --unstable --allow-all --watch test/
```
- Lint
```bash path=null start=null
deno lint
```
- Format
```bash path=null start=null
deno fmt
```
- NPM script (alternative runner, if Node.js is available)
```bash path=null start=null
npm test
```
Notes
- There is no build step; Deno executes TypeScript directly. The library is meant to be consumed by Deno-based services (e.g., rs-runtime).

High-level architecture
- HTTP primitives
  - Message: Canonical HTTP message wrapper with headers, status, optional body (MessageBody), cookies, user, and WebSocket fields. Enforces payload–header consistency and provides helpers for content negotiation and range handling.
  - Url: Internal URL model with base/service/sub path segmentation, query parsing/building, relative following, fragment handling, and private segment stripping. Integrates with PathPattern to render URLs from patterns and data.

- Path and pattern utilities
  - PathPattern: Powerful pattern resolver supporting substitutions from current/base/sub paths, name, query, full URL, and JSON-path expressions over data objects. Used for generating outbound URLs and mapping paths to data.
  - PathMap/longestMatchingPath: Used by the router to prefer the most specific registered path handlers.

- Service router and handlers
  - Service<TAdapter, TConfig>: Core router that registers handlers per HTTP method and base path, and dispatches by the longest matching path under a service base. Supports directory handlers (getDirectory/postDirectory/etc.), an all method, and automatic head/put fallbacks.
  - Validation: Optional JSON schema validation (schemasafe) and content-type checks on post/put handlers via setMethodPath wrappers.
  - AuthService: Extends Service; allows injecting a setUser function to attach user context per request.

- Service context, logging, and pipelines
  - ServiceContext/BaseContext: Execution context passed to handlers. Provides makeRequest, getAdapter, verifyJsonResponse/verifyResponse, runPipeline, a wrapped logger, and tracing/user metadata (traceparent/tracestate/user/serviceName).
  - Logging: createWrappedLogger decorates Deno std log with tenant/service/user/trace correlation.
  - Proxy: When manifest.proxyAdapterSource is set, context.makeProxyRequest uses an IProxyAdapter to construct proxy requests.
  - Pipelines: PipelineSpec is a nested array structure (strings or sub-pipelines) with a schemasafe validator (pipelineValidate) and concat helper. Context.runPipeline executes these over messages.

- State management
  - BaseStateClass / MultiStateClass: Pluggable state containers scoped by serviceName/tenant. Backed by an IDataAdapter dataset ("_state_{tenant}") for get/set/delete.
  - TimedActionState: Utility base for repeatable scheduled actions defined with ISO-8601 durations (via dayjs duration plugin), with pause/end controls and cleanup on unload.

- Adapters (interfaces only here; implementations live elsewhere)
  - IAdapter: Base tag with props and context.
  - IDataAdapter: JSON key–value store interface with read/list/write/delete and metadata checks; used for state and data persistence.
  - IFileAdapter: File-system style interface for read/write/delete, directory listing, range reads, and path canonicalization helpers.
  - IProxyAdapter (referenced): Builds proxied Message instances for forwarding via context.makeProxyRequest.

- Streaming utilities
  - streams.ts: Helpers to convert between Deno Readers and Web streams, chunking (toBlockChunks, limitBytes), line splitting, and simple readFileStream/writeFileStream with error handling and directory creation.
  - streamParse.ts: Utilities to iterate a ReadableStreamDefaultReader, decode text chunks, scan for head matches (asyncHeadParser), and skip a byte count while maintaining a string buffer.

Testing layout
- All tests are under test/ and run with deno test. Common test files include Url.test.ts, PathPattern.test.ts, streamParse.test.ts, and utility/adapter tests.

Environment
- Requires Deno (npm compatibility is used via npm: imports; no bundler required). deno.lock pins remote dependencies. If local import mapping in deno.json cannot resolve, clone the sibling repo or update the import map accordingly.
