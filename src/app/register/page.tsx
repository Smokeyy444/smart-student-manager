"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { registerUser } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { BookOpen } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);
    try {
      const result = await registerUser(data);
      if (result.success) {
        toast({
          title: "Account Created!",
          description: "Your student profile has been set up with Semester 1 and 75% attendance target.",
          type: "success",
        });
        router.push("/dashboard");
        router.refresh();
      } else {
        setServerError(result.error || "Failed to create account.");
      }
    } catch {
      setServerError("An unexpected connection error occurred.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-[var(--bg-app)]">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-white shadow-md">
            <BookOpen className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Create Student Account
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Initialize your personalized academic cockpit and multi-semester tracker.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Registration</CardTitle>
            <CardDescription>Enter your details to create your academic record</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {serverError && (
                <div
                  role="alert"
                  className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-3 text-xs text-[var(--accent-danger)] font-medium"
                >
                  {serverError}
                </div>
              )}

              <Input
                label="Full Name"
                type="text"
                autoComplete="name"
                placeholder="Jane Doe"
                error={errors.fullName?.message}
                required
                {...register("fullName")}
              />

              <Input
                label="Email Address"
                type="email"
                autoComplete="email"
                placeholder="jane.doe@university.edu"
                error={errors.email?.message}
                required
                {...register("email")}
              />

              <Input
                label="Password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                helperText="Must be 8+ characters with uppercase, lowercase, and a number"
                error={errors.password?.message}
                required
                {...register("password")}
              />

              <Input
                label="Confirm Password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                error={errors.confirmPassword?.message}
                required
                {...register("confirmPassword")}
              />

              <Button
                type="submit"
                className="w-full"
                isLoading={isSubmitting}
                disabled={isSubmitting}
              >
                Register & Set Up
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center text-xs text-[var(--text-secondary)]">
            <span>Already have an account?</span>
            <Link
              href="/login"
              className="ml-1 font-semibold text-[var(--brand-primary)] hover:underline"
            >
              Sign In
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
