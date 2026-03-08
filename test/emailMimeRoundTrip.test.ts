import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { emailRawToObject, objectEmailToRaw } from "../email/emailRawToObject.ts";

Deno.test("email parser normalizes quoted-printable attachment to base64", () => {
    const rawEmail = [
        "Message-ID: <msg-1@test>",
        "From: sender@example.com",
        "To: recipient@example.com",
        "Date: Tue, 09 Mar 2026 12:00:00 GMT",
        "Subject: Attachment test",
        "MIME-Version: 1.0",
        'Content-Type: multipart/mixed; boundary="b1"',
        "",
        "--b1",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "hello",
        "--b1",
        "Content-Type: text/plain; name=\"note.txt\"",
        "Content-Disposition: attachment; filename=\"note.txt\"",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Hello=0AWorld",
        "--b1--",
        "",
    ].join("\r\n");

    const email = emailRawToObject(rawEmail);
    assertEquals(email.attachments?.length, 1);
    assertEquals(email.attachments?.[0].name, "note.txt");
    assertEquals(email.attachments?.[0].disposition, "attachment");
    assertEquals(email.attachments?.[0].contentBase64, "SGVsbG8KV29ybGQ=");

    const rewritten = objectEmailToRaw(email);
    assertStringIncludes(rewritten, "Content-Transfer-Encoding: base64");
    assertStringIncludes(rewritten, "SGVsbG8KV29ybGQ=");
});

Deno.test("email parser preserves inline attachment disposition and content-id", () => {
    const rawEmail = [
        "Message-ID: <msg-2@test>",
        "From: sender@example.com",
        "To: recipient@example.com",
        "Date: Tue, 09 Mar 2026 12:01:00 GMT",
        "Subject: Inline image test",
        "MIME-Version: 1.0",
        'Content-Type: multipart/related; boundary="b2"',
        "",
        "--b2",
        "Content-Type: text/html; charset=utf-8",
        "",
        "<html><body><img src=\"cid:img-1\"></body></html>",
        "--b2",
        "Content-Type: image/png; name=\"logo.png\"",
        "Content-Disposition: inline; filename=\"logo.png\"",
        "Content-ID: <img-1>",
        "Content-Transfer-Encoding: base64",
        "",
        "QUJDRA==",
        "--b2--",
        "",
    ].join("\r\n");

    const email = emailRawToObject(rawEmail);
    assertEquals(email.attachments?.length, 1);
    assertEquals(email.attachments?.[0].name, "logo.png");
    assertEquals(email.attachments?.[0].disposition, "inline");
    assertEquals(email.attachments?.[0].contentId, "img-1");
    assertEquals(email.attachments?.[0].contentBase64, "QUJDRA==");

    const rewritten = objectEmailToRaw(email);
    assertStringIncludes(rewritten, "Content-Disposition: inline; filename=\"logo.png\"");
    assertStringIncludes(rewritten, "Content-ID: <img-1>");
});
