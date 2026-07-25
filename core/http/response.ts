export class Response extends globalThis.Response {
  static ok(data?: BodyInit, init?: ResponseInit) {
    return new Response(data ?? "Ok", init ?? { status: 200 });
  }

  static accepted(data?: BodyInit, init?: ResponseInit) {
    return new Response(data ?? "Accepted", init ?? { status: 202 });
  }

  static created(data: unknown, init?: ResponseInit) {
    return Response.json(data, init ?? { status: 201 });
  }

  static unauthorized(data?: BodyInit, init?: ResponseInit) {
    return new Response(data ?? "Unauthorized", init ?? { status: 401 });
  }

  static forbidden(data?: BodyInit, init?: ResponseInit) {
    return new Response(data ?? "Forbidden", init ?? { status: 403 });
  }

  static badRequest(data?: BodyInit, init?: ResponseInit) {
    return new Response(data ?? "Bad Request", init ?? { status: 400 });
  }

  static notFound(data?: BodyInit, init?: ResponseInit) {
    return new Response(data ?? "Not Found", init ?? { status: 404 });
  }

  static override redirect(url: string | URL, status?: number) {
    return new Response(null, {
      status: status ?? 302,
      headers: {
        Location: url.toString(),
      },
    });
  }
}
