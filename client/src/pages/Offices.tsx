import { useDeferredValue, useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Phone, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Office, OfficeType } from "@/types";
import { usePagedOffices, useCreateOffice, useUpdateOffice, useDeleteOffice } from "@/hooks/useOffices";
import { useDivisions } from "@/hooks/useDivisions";
import { useDistricts } from "@/hooks/useDistricts";
import { OfficeFormModal } from "@/components/forms/OfficeFormModal";
import { DivisionManagementModal } from "@/components/shared/DivisionManagementModal";
import { DistrictManagementModal } from "@/components/shared/DistrictManagementModal";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { DataTable } from "@/components/shared/DataTable";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { useViewMode } from "@/hooks/useViewMode";

const OFFICE_VIEW_TABS: Array<{ value: OfficeType; label: string }> = [
  { value: "DIRECTORATE", label: "Directorates" },
  { value: "DISTRICT_OFFICE", label: "District Offices" },
  { value: "DISTRICT_LAB", label: "District Labs" },
];

function officeTypeLabel(type?: string | null) {
  if (type === "HEAD_OFFICE") return "Head Office";
  if (type === "DIRECTORATE") return "Directorate";
  if (type === "DISTRICT_OFFICE") return "District Office";
  if (type === "DISTRICT_LAB") return "District Lab";
  if (type) return `Legacy: ${type}`;
  return "Unknown";
}

export default function Offices() {
  const PAGE_SIZE = 60;
  const { isOrgAdmin } = useAuth();
  const createOffice = useCreateOffice();
  const updateOffice = useUpdateOffice();
  const deleteOffice = useDeleteOffice();
  const { data: divisions = [] } = useDivisions();
  const { data: districts = [] } = useDistricts();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [divisionModalOpen, setDivisionModalOpen] = useState(false);
  const [districtModalOpen, setDistrictModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<OfficeType>("DIRECTORATE");
  const [page, setPage] = useState(1);
  const { mode: viewMode, setMode: setViewMode } = useViewMode("offices");
  const pageSearch = usePageSearch();
  const searchTerm = useDeferredValue((pageSearch?.term || "").trim());
  const { data: officesResponse, isLoading } = usePagedOffices({
    page,
    limit: PAGE_SIZE,
    type: activeTab,
    search: searchTerm || undefined,
  });
  const visibleOffices = officesResponse?.items || [];
  const totalOffices = officesResponse?.total || visibleOffices.length;
  const totalPages = Math.max(1, Math.ceil(totalOffices / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchTerm]);

  const handleAddOffice = () => {
    setEditingOffice(null);
    setModalOpen(true);
  };

  const handleEditOffice = (office: Office) => {
    setEditingOffice(office);
    setModalOpen(true);
  };

  const handleOfficeSubmit = async (data: {
    name: string;
    division: string;
    district: string;
    address: string;
    contactNumber: string;
    type: OfficeType;
    parentOfficeId?: string;
    capabilities?: {
      moveables?: boolean;
      consumables?: boolean;
      chemicals?: boolean;
    };
  }) => {
    if (editingOffice) {
      await updateOffice.mutateAsync({ id: editingOffice.id, data });
    } else {
      await createOffice.mutateAsync(data);
    }
  };

  const handleOfficeDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this office?")) {
      deleteOffice.mutate(id);
    }
  };

  const columns = [
    {
      key: "name",
      label: "Office",
      render: (value: string, row: Office) => (
        <div>
          <p className="font-medium">{value}</p>
          <p className="text-xs text-muted-foreground">{officeTypeLabel(row.type)}</p>
        </div>
      ),
    },
    { key: "division", label: "Division", render: (value: string) => value || "N/A" },
    { key: "district", label: "District", render: (value: string) => value || "N/A" },
    { key: "address", label: "Address", render: (value: string) => value || "N/A" },
    { key: "contact_number", label: "Contact", render: (value: string) => value || "N/A" },
  ];

  const actions = (office: Office) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleEditOffice(office)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => handleOfficeDelete(office.id)}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Offices" description="Manage offices, divisions, and districts">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Offices" description="Manage offices, divisions, and districts">
      <PageHeader
        title="Offices"
        description="Manage all offices, divisions, and districts"
        action={{ label: "Add Office", onClick: handleAddOffice }}
        extra={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <ViewModeToggle mode={viewMode} onModeChange={setViewMode} />
            {isOrgAdmin ? (
              <>
                <Button variant="outline" onClick={() => setDivisionModalOpen(true)}>
                  Manage Divisions
                </Button>
                <Button variant="outline" onClick={() => setDistrictModalOpen(true)}>
                  Manage Districts
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as OfficeType)} className="mb-6">
        <TabsList className="w-full justify-start overflow-x-auto whitespace-nowrap">
          {OFFICE_VIEW_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {viewMode === "list" ? (
        <DataTable
          columns={columns}
          data={visibleOffices}
          pagination={false}
          searchable={false}
          useGlobalPageSearch={false}
          actions={actions}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleOffices.map((office) => (
              <Card key={office.id} className="group hover:shadow-md transition-all animate-fade-in">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MapPin className="h-6 w-6 text-primary" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditOffice(office)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleOfficeDelete(office.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <h3 className="font-semibold text-lg mb-1">{office.name}</h3>
                  <Badge variant="outline" className="mb-2">{officeTypeLabel(office.type)}</Badge>
                  <p className="text-sm text-muted-foreground mb-2">{office.division || "Division not set"}</p>
                  <p className="text-sm text-muted-foreground mb-4">{office.district || "District not set"}</p>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{office.address || "No address"}</p>

                  <div className="flex items-center gap-2 pt-4 border-t">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{office.contact_number || "No contact"}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {visibleOffices.length === 0 && (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No offices found for this type.
              </CardContent>
            </Card>
          )}
        </>
      )}
      <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          Showing {visibleOffices.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to{" "}
          {Math.min(page * PAGE_SIZE, totalOffices)} of {totalOffices} offices
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
            Previous
          </Button>
          <span className="text-sm font-medium">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>

      <OfficeFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        office={editingOffice}
        divisions={divisions}
        districts={districts}
        onSubmit={handleOfficeSubmit}
      />

      {isOrgAdmin && (
        <>
          <DivisionManagementModal open={divisionModalOpen} onOpenChange={setDivisionModalOpen} />
          <DistrictManagementModal
            open={districtModalOpen}
            onOpenChange={setDistrictModalOpen}
            divisions={divisions}
          />
        </>
      )}
    </MainLayout>
  );
}
