import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Fingerprint } from "lucide-react";
import { useLogin, useRegister } from "./useAuth";
import {
  loginSchema,
  registerSchema,
  type LoginFormValues,
  type RegisterFormValues,
} from "./authSchemas";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/records";

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  function onLoginSuccess() {
    navigate(from, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-primary">MedGuard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Secure medical records</p>
        </div>

        {mode === "login" ? (
          <LoginForm
            isPending={loginMutation.isPending}
            error={loginMutation.error?.message}
            onSubmit={(values) => loginMutation.mutate(values, { onSuccess: onLoginSuccess })}
            onSwitchMode={() => setMode("register")}
          />
        ) : (
          <RegisterForm
            isPending={registerMutation.isPending}
            error={registerMutation.error?.message}
            onSubmit={(values) =>
              registerMutation.mutate(values, { onSuccess: onLoginSuccess })
            }
            onSwitchMode={() => setMode("login")}
          />
        )}
      </div>
    </div>
  );
}

function LoginForm({
  isPending,
  error,
  onSubmit,
  onSwitchMode,
}: {
  isPending: boolean;
  error?: string | undefined;
  onSubmit: (values: LoginFormValues) => void;
  onSwitchMode: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showTotp, setShowTotp] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  // When the mutation returns an MFA challenge, reveal the TOTP field.
  const needsMfa = error?.includes("MFA required");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <PasskeyButton label="Sign in with passkey" />

      <Divider label="or continue with email" />

      <Field label="Email" error={errors.email?.message}>
        <input
          {...register("email")}
          type="email"
          autoComplete="email"
          className={inputClass(!!errors.email)}
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Password" error={errors.password?.message}>
        <div className="relative">
          <input
            {...register("password")}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className={cn(inputClass(!!errors.password), "pr-10")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>

      {(showTotp || needsMfa) && (
        <Field label="Authenticator code" error={errors.totpCode?.message}>
          <input
            {...register("totpCode")}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className={inputClass(!!errors.totpCode)}
            placeholder="000000"
          />
        </Field>
      )}

      {error && !needsMfa && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {needsMfa && !showTotp && (
        <button
          type="button"
          className="text-sm text-primary underline"
          onClick={() => setShowTotp(true)}
        >
          Enter your authenticator code
        </button>
      )}

      <button
        type="submit"
        disabled={isPending}
        className={primaryButtonClass}
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <button type="button" onClick={onSwitchMode} className="text-primary underline">
          Register
        </button>
      </p>
    </form>
  );
}

function RegisterForm({
  isPending,
  error,
  onSubmit,
  onSwitchMode,
}: {
  isPending: boolean;
  error?: string | undefined;
  onSubmit: (values: RegisterFormValues) => void;
  onSwitchMode: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <PasskeyButton label="Register with passkey" />

      <Divider label="or register with email" />

      <Field label="Full name" error={errors.displayName?.message}>
        <input
          {...register("displayName")}
          type="text"
          autoComplete="name"
          className={inputClass(!!errors.displayName)}
          placeholder="Jane Smith"
        />
      </Field>

      <Field label="Email" error={errors.email?.message}>
        <input
          {...register("email")}
          type="email"
          autoComplete="email"
          className={inputClass(!!errors.email)}
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Password" error={errors.password?.message}>
        <div className="relative">
          <input
            {...register("password")}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className={cn(inputClass(!!errors.password), "pr-10")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>

      <Field label="Confirm password" error={errors.confirmPassword?.message}>
        <input
          {...register("confirmPassword")}
          type="password"
          autoComplete="new-password"
          className={inputClass(!!errors.confirmPassword)}
        />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className={primaryButtonClass}
      >
        {isPending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <button type="button" onClick={onSwitchMode} className="text-primary underline">
          Sign in
        </button>
      </p>
    </form>
  );
}

function PasskeyButton({ label }: { label: string }) {
  return (
    <button type="button" className={cn(primaryButtonClass, "flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
      <Fingerprint size={18} />
      {label}
    </button>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const inputClass = (hasError: boolean) =>
  cn(
    "w-full rounded-md border px-3 py-2 text-sm bg-background text-foreground",
    "focus:outline-none focus:ring-2 focus:ring-ring",
    hasError ? "border-destructive focus:ring-destructive" : "border-input"
  );

const primaryButtonClass =
  "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";