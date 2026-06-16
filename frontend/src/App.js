import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { FullPageLoader } from "./components/common";
import { Toaster } from "./components/ui/sonner";

// Code-split every page/layout so the initial bundle stays small. URLs/behavior unchanged.
const Landing = lazy(() => import("./pages/public/Landing"));
const About = lazy(() => import("./pages/public/About"));
const Privacy = lazy(() => import("./pages/public/Privacy"));
const Terms = lazy(() => import("./pages/public/Terms"));
const Consent = lazy(() => import("./pages/public/Consent"));
const MedicalDisclaimer = lazy(() => import("./pages/public/MedicalDisclaimer"));
const DataDeletion = lazy(() => import("./pages/public/DataDeletion"));
const Safety = lazy(() => import("./pages/public/Safety"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const Login = lazy(() => import("./pages/auth/Login"));
const Signup = lazy(() => import("./pages/auth/Signup"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const ShareExport = lazy(() => import("./pages/ShareExport"));
const PatientMemoryBook = lazy(() => import("./pages/patient/PatientMemoryBook"));
const CgMemoryBook = lazy(() => import("./pages/caregiver/CgMemoryBook"));
const CgFamily = lazy(() => import("./pages/caregiver/CgFamily"));
const CgWhatsApp = lazy(() => import("./pages/caregiver/CgWhatsApp"));
const CalendarConnector = lazy(() => import("./pages/caregiver/CalendarConnector"));

const PatientLayout = lazy(() => import("./pages/patient/PatientLayout"));
const PatientHome = lazy(() => import("./pages/patient/PatientHome"));
const RecordMemory = lazy(() => import("./pages/patient/RecordMemory"));
const Assistant = lazy(() => import("./pages/patient/Assistant"));
const TodaySummary = lazy(() => import("./pages/patient/TodaySummary"));
const PatientReminders = lazy(() => import("./pages/patient/PatientReminders"));
const PatientPeople = lazy(() => import("./pages/patient/PatientPeople"));
const PatientPlaces = lazy(() => import("./pages/patient/PatientPlaces"));
const Emergency = lazy(() => import("./pages/patient/Emergency"));
const PatientSettings = lazy(() => import("./pages/patient/PatientSettings"));

const CaregiverLayout = lazy(() => import("./pages/caregiver/CaregiverLayout"));
const CaregiverDashboard = lazy(() => import("./pages/caregiver/CaregiverDashboard"));
const PatientOverview = lazy(() => import("./pages/caregiver/PatientOverview"));
const Timeline = lazy(() => import("./pages/caregiver/Timeline"));
const CgReminders = lazy(() => import("./pages/caregiver/CgReminders"));
const Medication = lazy(() => import("./pages/caregiver/Medication"));
const Appointments = lazy(() => import("./pages/caregiver/Appointments"));
const CgPeople = lazy(() => import("./pages/caregiver/CgPeople"));
const CgPlaces = lazy(() => import("./pages/caregiver/CgPlaces"));
const Alerts = lazy(() => import("./pages/caregiver/Alerts"));
const CaregiverNotes = lazy(() => import("./pages/caregiver/CaregiverNotes"));
const CgSettings = lazy(() => import("./pages/caregiver/CgSettings"));

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminCollections = lazy(() => import("./pages/admin/AdminCollections"));
const AdminLogs = lazy(() => import("./pages/admin/AdminLogs"));
const AdminCosts = lazy(() => import("./pages/admin/AdminCosts"));

const CaptureStart = lazy(() => import("./pages/capture/CaptureStart"));
const AlwaysOnSetup = lazy(() => import("./pages/capture/AlwaysOnSetup"));
const CaptureSession = lazy(() => import("./pages/capture/CaptureSession"));
const CaptureSessions = lazy(() => import("./pages/capture/CaptureSessions"));
const PrivacyReview = lazy(() => import("./pages/capture/PrivacyReview"));
const PrivacyVault = lazy(() => import("./pages/capture/PrivacyVault"));
const CaptureSettings = lazy(() => import("./pages/capture/CaptureSettings"));
const SmartDayDrafts = lazy(() => import("./pages/patient/SmartDayDrafts"));

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
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/about" element={<About />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/consent" element={<Consent />} />
      <Route path="/medical-disclaimer" element={<MedicalDisclaimer />} />
      <Route path="/data-deletion" element={<DataDeletion />} />
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
        <Route path="notifications" element={<NotificationSettings />} />
        <Route path="capture" element={<CaptureStart mode="capture" />} />
        <Route path="meeting" element={<CaptureStart mode="meeting" />} />
        <Route path="capture/always-on" element={<AlwaysOnSetup />} />
        <Route path="capture/session/:id" element={<CaptureSession />} />
        <Route path="capture/review" element={<PrivacyReview />} />
        <Route path="capture/vault" element={<PrivacyVault />} />
        <Route path="capture/settings" element={<CaptureSettings />} />
        <Route path="capture/smart-day-drafts" element={<SmartDayDrafts />} />
        <Route path="share" element={<ShareExport />} />
        <Route path="memory-book" element={<PatientMemoryBook />} />
        <Route path="*" element={<Navigate to="/patient" replace />} />
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
        <Route path="notifications" element={<NotificationSettings />} />
        <Route path="capture" element={<CaptureStart mode="capture" />} />
        <Route path="meeting" element={<CaptureStart mode="meeting" />} />
        <Route path="capture/always-on" element={<AlwaysOnSetup />} />
        <Route path="capture/sessions" element={<CaptureSessions />} />
        <Route path="capture/session/:id" element={<CaptureSession />} />
        <Route path="capture/review" element={<PrivacyReview />} />
        <Route path="capture/vault" element={<PrivacyVault />} />
        <Route path="capture/settings" element={<CaptureSettings />} />
        <Route path="share" element={<ShareExport />} />
        <Route path="memory-book" element={<CgMemoryBook />} />
        <Route path="family" element={<CgFamily />} />
        <Route path="whatsapp" element={<CgWhatsApp />} />
        <Route path="calendar" element={<CalendarConnector />} />
        <Route path="*" element={<Navigate to="/caregiver" replace />} />
      </Route>

      <Route path="/admin" element={<Protected roles={["admin"]}><AdminLayout /></Protected>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="data" element={<AdminCollections />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="costs" element={<AdminCosts />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<FullPageLoader />}>
          <AppRoutes />
        </Suspense>
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
