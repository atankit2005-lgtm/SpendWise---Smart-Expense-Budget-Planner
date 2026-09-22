import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import { publishRealtimeEvent } from "./registry";
import { subscriberCountFor } from "./registry";
import { createRealtimeStream } from "./stream";

function userId(): string {
  return randomUUID();
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value, done } = await reader.read();
  assert.equal(done, false);
  return new TextDecoder().decode(value);
}

describe("realtime SSE stream", () => {
  it("responds with the required SSE headers", () => {
    const user = userId();
    const { response, stop } = createRealtimeStream(user);

    assert.equal(response.headers.get("Content-Type"), "text/event-stream");
    assert.equal(response.headers.get("Cache-Control"), "no-cache");
    assert.equal(response.headers.get("Connection"), "keep-alive");

    stop();
  });

  it("registers exactly one subscriber for the connecting user on start", async () => {
    const user = userId();
    const { response, stop } = createRealtimeStream(user);
    const reader = response.body!.getReader();

    // The opening comment is enqueued synchronously inside start(), so by
    // the time the first chunk resolves, subscribe() has already run.
    await readChunk(reader);

    assert.equal(subscriberCountFor(user), 1);

    await reader.cancel();
    stop();
  });

  it("delivers a published event to the stream as a properly framed SSE chunk", async () => {
    const user = userId();
    const { response, stop } = createRealtimeStream(user);
    const reader = response.body!.getReader();

    await readChunk(reader); // opening ": connected" comment

    publishRealtimeEvent(user, { type: "goal.changed" });
    const chunk = await readChunk(reader);

    assert.match(chunk, /^event: goal\.changed\n/m);
    assert.match(chunk, /"type":"goal\.changed"/);

    await reader.cancel();
    stop();
  });

  it("removes the subscriber when the stream is cancelled (client disconnect)", async () => {
    const user = userId();
    const { response } = createRealtimeStream(user);
    const reader = response.body!.getReader();

    await readChunk(reader);
    assert.equal(subscriberCountFor(user), 1);

    await reader.cancel();

    assert.equal(subscriberCountFor(user), 0);

    // A publish after disconnect must not throw and must not reach anyone.
    assert.doesNotThrow(() => publishRealtimeEvent(user, { type: "budget.changed" }));
  });

  it("keeps two connections for the same user isolated from a third user", async () => {
    const userA = userId();
    const userB = userId();

    const connA1 = createRealtimeStream(userA);
    const connA2 = createRealtimeStream(userA);
    const connB = createRealtimeStream(userB);

    const readerA1 = connA1.response.body!.getReader();
    const readerA2 = connA2.response.body!.getReader();
    const readerB = connB.response.body!.getReader();

    await Promise.all([readChunk(readerA1), readChunk(readerA2), readChunk(readerB)]);

    assert.equal(subscriberCountFor(userA), 2);
    assert.equal(subscriberCountFor(userB), 1);

    publishRealtimeEvent(userA, { type: "transaction.changed" });

    const [chunkA1, chunkA2] = await Promise.all([readChunk(readerA1), readChunk(readerA2)]);
    assert.match(chunkA1, /transaction\.changed/);
    assert.match(chunkA2, /transaction\.changed/);

    await readerA1.cancel();
    await readerA2.cancel();
    await readerB.cancel();
    connA1.stop();
    connA2.stop();
    connB.stop();
  });
});
