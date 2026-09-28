import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { DashboardPage } from "@/pages/DashboardPage";
import { RunsPage } from "@/pages/RunsPage";
import { QueuesPage } from "@/pages/QueuesPage";
import { WorkersPage } from "@/pages/WorkersPage";
import { TriggersPage } from "@/pages/TriggersPage";
import { AssetsPage } from "@/pages/AssetsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/triggers" element={<TriggersPage />} />
          <Route path="/workers" element={<WorkersPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/queues" element={<QueuesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
