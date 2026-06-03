import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { FullPageLoader } from "./components/common";
import { Toaster } from "./components/ui/sonner";

import Landing from "./pages/public/Landing";
import About from "./pages/public/About";
import Privacy from "./pages/public/Privacy";
import Safety from "./pages/public/Safety";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import Onboarding from "./pages/Onboarding";

import PatientLayout from "./pages/patient/PatientLayout";
import PatientHome from "./pages/patient/PatientHome";
import RecordMemory from "./pages/patient/RecordMemory";
import Assistant from "./pages/patient/Assistant";
import TodaySummary from "./pages/patient/TodaySummary";
import PatientReminders from "./pages/patient/PatientReminders";
import PatientPeople from "./pages/patient/PatientPeople";
import PatientPlaces from "./pages/patient/PatientPlaces";
import Emergency from "./pages/patient/Emergency";
import PatientSettings from "./pages/patient/PatientSettings";

import CaregiverLayout from "./pages/caregiver/CaregiverLayout";
import CaregiverDashboard from "./pages/caregiver/CaregiverDashboard";
import PatientOverview from "./pages/caregiver/PatientOverview";
import Timeline from "./pages/caregiver/Timeline";
import CgReminders from "./pages/caregiver/CgReminders";
import Medication from "./pages/caregiver/Medication";
import Appointments from "./pages/caregiver/Appointments";
import CgPeople from "./pages/caregiver/CgPeople";
import CgPlaces from "./pages/caregiver/CgPlaces";
import Alerts from "./pages/caregiver/Alerts";
import CaregiverNotes from "./pages/caregiver/CaregiverNotes";
import CgSettings from "./pages/caregiver/CgSettings";

import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminCollections from "./pages/admin/AdminCollections";
import AdminLogs from "./pages/admin/AdminLogs";

import CaptureStart from "./pages/capture/CaptureStart";
import CaptureSession from "./pages/capture/CaptureSession";
import CaptureSessions from "./pages/capture/CaptureSessions";
import PrivacyReview from "./pages/capture/PrivacyReview";
import CaptureSettings from "./pages/capture/CaptureSettings";

function homePath(role) {
  if (role === "patient") return "/patient";
  if (role === "caregiver") return "/caregiver";
  if (role === "admin") return "/admin";
  return "/login";
}

function Protected({ roles, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === null) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePath(user.role)} replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user } = useAuth();
  if (user === null) return <FullPageLoader />;
  if (user) return <Navigate to={homePath(user.role)} replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/about" element={<About />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/safety" element={<Safety />} />
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
      <Route path="/onboarding" element={<Protected roles={["patient", "caregiver"]}><Onboarding /></Protected>} />

      <Route path="/patient" element={<Protected roles={["patient"]}><PatientLayout /></Protected>}>
        <Route index element={<PatientHome />} />
        <Route path="record" element={<RecordMemory />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="today" element={<TodaySummary />} />
        <Route path="reminders" element={<PatientReminders />} />
        <Route path="people" element={<PatientPeople />} />
        <Route path="places" element={<PatientPlaces />} />
        <Route path="emergency" element={<Emergency />} />
        <Route path="settings" element={<PatientSettings />} />
        <Route path="capture" element={<CaptureStart mode="capture" />} />
        <Route path="meeting" element={<CaptureStart mode="meeting" />} />
        <Route path="capture/session/:id" element={<CaptureSession />} />
        <Route path="capture/review" element={<PrivacyReview />} />
        <Route path="capture/settings" element={<CaptureSettings />} />
      </Route>

      <Route path="/caregiver" element={<Protected roles={["caregiver", "admin"]}><CaregiverLayout /></Protected>}>
        <Route index element={<CaregiverDashboard />} />
        <Route path="overview" element={<PatientOverview />} />
        <Route path="timeline" element={<Timeline />} />
        <Route path="reminders" element={<CgReminders />} />
        <Route path="medication" element={<Medication />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="people" element={<CgPeople />} />
        <Route path="places" element={<CgPlaces />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="notes" element={<CaregiverNotes />} />
        <Route path="settings" element={<CgSettings />} />
        <Route path="capture" element={<CaptureStart mode="capture" />} />
        <Route path="meeting" element={<CaptureStart mode="meeting" />} />
        <Route path="capture/sessions" element={<CaptureSessions />} />
        <Route path="capture/session/:id" element={<CaptureSession />} />
        <Route path="capture/review" element={<PrivacyReview />} />
        <Route path="capture/settings" element={<CaptureSettings />} />
      </Route>

      <Route path="/admin" element={<Protected roles={["admin"]}><AdminLayout /></Protected>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="data" element={<AdminCollections />} />
        <Route path="logs" element={<AdminLogs />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
