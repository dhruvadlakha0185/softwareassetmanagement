import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../../store/authStore";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate("/");
    } catch {
      // error surfaced from store
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-logo">
          <div className="tb-dot" style={{ width: 36, height: 36, fontSize: 15 }}>
            DRL
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--tx)" }}>
              SAM Platform
            </div>
            <div style={{ fontSize: 11, color: "var(--tx-q)" }}>
              Software Asset Management
            </div>
          </div>
        </div>

        <div className="login-title">Sign in to SAM</div>
        <div className="login-sub">Dr. Reddy's Laboratories · IT COE</div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="fg">
            <label className="fl">Email address</label>
            <input
              className="fi2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.name@drl.com"
              required
              autoFocus
            />
          </div>
          <div className="fg" style={{ marginBottom: 18 }}>
            <label className="fl">Password</label>
            <input
              className="fi2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-p"
            disabled={loading}
            style={{ width: "100%", justifyContent: "center", padding: "10px" }}
          >
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <div
          style={{
            marginTop: 16,
            fontSize: 11,
            color: "var(--tx-q)",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          Local dev · admin@drl.local / Admin123!
        </div>
      </div>
    </div>
  );
}
