import { LoginForm } from "@/components/login-form";
export default function Login() {
  return <LoginForm demo={process.env.DEMO_MODE === "true"} />;
}
