import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError } from "@/src/server/rbac";
import { AuthenticationError } from "@/src/server/auth";
import { CsrfError } from "@/src/server/csrf";
import { DomainError } from "@/src/server/services/lead-service";
import { ImportServiceError } from "@/src/server/services/import-service";
import { CsvFormatError } from "@/src/lib/csv/detection";

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Revise os campos informados.", fields: error.flatten().fieldErrors }, { status: 422 });
  }
  if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof CsrfError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ImportServiceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof CsvFormatError) return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
  console.error("Unhandled API error", error);
  return NextResponse.json({ error: "Ocorreu um erro inesperado. Tente novamente." }, { status: 500 });
}
