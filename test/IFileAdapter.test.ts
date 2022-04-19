import { assertEquals, assert } from "std/testing/asserts.ts";
import { MessageBody } from '../MessageBody.ts';
import { IFileAdapter } from '../adapter/IFileAdapter.ts';

const testFileSpace = (adapter: IFileAdapter) => {
    const encoder = new TextEncoder();
    Deno.test('saves file', async () => {
        await adapter.write('abc-def_ghi/jkl mno.html', new MessageBody(encoder.encode('<span>This is a file</span>'), 'text/html'));
    });
    Deno.test('reads file', async () => {
        const res = await adapter.read('abc-def_ghi/jkl mno.html');
        assertEquals(await res.asString(), '<span>This is a file</span>');
        const now = new Date();
        if (res.dateModified !== undefined) {
            assert(res.dateModified <= now, 'Date modified in past');
            assert((now.valueOf() - res.dateModified.valueOf()) < 1000, 'Date modified is recent');
        }
        assertEquals(res.mimeType, 'text/html');
    });
    Deno.test('deletes file', async () => {
        const res = await adapter.delete('abc-def_ghi/jkl mno.html');
        assertEquals(res, 200);
    });
    Deno.test('deletes non-existent file with 404', async () => {
        const res = await adapter.delete('abc-def_ghi/jkl mno.txt');
        assertEquals(res, 404);
    });
    Deno.test('gets 404 on missing file', async () => {
        const res = await adapter.read('abc-def_ghi/jkl mno.html');
        try {
            await res.asArrayBuffer();
        } catch (err) {}
        assertEquals(res.statusCode, 404);
    });
    Deno.test('writes two to directory', async () => {
        await adapter.write('dir/item1.txt', new MessageBody(encoder.encode('An item'), 'text/plain'));
        await adapter.write('dir/item2.json', new MessageBody(encoder.encode('{ "abc": 2 }'), 'application/json'));
    });
    Deno.test('writes subdirectory item', async () => {
        await adapter.write('dir/subdir/item3.txt', new MessageBody(encoder.encode('Another item'), 'text/plain'));
    });
    Deno.test('reads directory', async () => {
        const res = await adapter.readDirectory('dir/');
        const dir = await res.asJson();
        assertEquals(dir.length, 3);
        assert(dir.some((i: any) => i.name === 'item1.txt'));
        assert(dir.some((i: any) => i.name === 'item2.json'));
        assert(dir.some((i: any) => i.name === 'subdir/'));
    });
    Deno.test('gets 404 for missing directory', async () => {
        const res = await adapter.readDirectory('dir/abc/');
        assertEquals(res.statusCode, 404);
    });
    Deno.test('gets 400 for delete directory with items', async () => {
        const res = await adapter.deleteDirectory('dir/subdir');
        assertEquals(res, 400);
    });
    Deno.test('deletes directory', async () => {
        await adapter.delete('dir/subdir/item3.txt');
        const res = await adapter.deleteDirectory('dir/subdir');
        assertEquals(res, 200);
        const res2 = await adapter.readDirectory('dir/subdir/');
        assertEquals(res2.statusCode, 404);
    });
    Deno.test('gets 404 for delete missing directory', async () => {
        const res = await adapter.deleteDirectory('dir/xyz');
        assertEquals(res, 404);
    });
};

/*
testFileSpace(new LocalFileAdapter("test", {
    rootPath: "C:\\Dev\\test",
    basePath: "fileAdapter"
}));
*/