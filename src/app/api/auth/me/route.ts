import { NextRequest, NextResponse } from "next/server";

class AuthMeRoute {
  private readonly backendPath = "/api/v1/auth/me";

  async get(request: NextRequest) {
    if (process.env.NEXT_PUBLIC_AUTH_BYPASS === "true") {
      return NextResponse.json({
        success: true,
        data: {
          id: "local-dev-user",
          entraObjectId: "local-dev-user",
          name: "Local Dev User",
          email: "local.dev@example.gov.uk",
          role: "Authenticated User",
          initials: "LD",
          team: "Local Development",
        },
      });
    }

    const authorization = request.headers.get("authorization");

    if (!authorization) {
      return NextResponse.json(
        { success: false, message: "Unauthenticated." },
        { status: 401 },
      );
    }

    try {
      const response = await fetch(this.buildTargetUrl(this.backendPath), {
        headers: {
          authorization,
          accept: request.headers.get("accept") ?? "application/json",
        },
        cache: "no-store",
      });
      const text = await response.text();

      return new NextResponse(text, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") ?? "application/json",
        },
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          message: error instanceof Error ? error.message : "Failed to reach auth endpoint.",
        },
        { status: 500 },
      );
    }
  }

  private buildTargetUrl(pathname: string) {
    const baseUrl = this.getApiBaseUrl();
    const normalizedPathname =
      baseUrl.endsWith("/api/v1") && pathname.startsWith("/api/v1/")
        ? pathname.replace(/^\/api\/v1/, "")
        : pathname;

    return `${baseUrl}${normalizedPathname}`;
  }

  private getApiBaseUrl() {
    const value = process.env.CSG_API_BASE_URL ?? process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL;

    if (!value) {
      throw new Error("Missing CSG_API_BASE_URL environment variable.");
    }

    return value.replace(/\/+$/, "");
  }
}

const authMeRoute = new AuthMeRoute();

export async function GET(request: NextRequest) {
  return authMeRoute.get(request);
}
