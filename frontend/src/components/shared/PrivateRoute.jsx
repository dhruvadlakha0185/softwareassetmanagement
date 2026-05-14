import { Navigate } from "react-router-dom";
import useAuthStore from "../../store/authStore";

export default function PrivateRoute({ children, roles }) {
  const { token, user } = useAuthStore();

  if (!token) return <Navigate to="/login" replace />;

  if (roles && user && !roles.includes(user.role)) {
    return (
      <div className="page">
        <div className="ph">
          <h1>Access Denied</h1>
          <p>You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return children;
}
