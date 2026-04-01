import { useDeferredValue, useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
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
import { useOffices, useCreateOffice, useUpdateOffice, useDeleteOffice } from "@/hooks/useOffices";
import { useStores } from "@/hooks/useStores";
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
import { CollectionWorkspace } from "@/components/shared/CollectionWorkspace";

const OFFICE_VIEW_TABS: Array<{ value: OfficeType; label: string }> = [
  { value: "HEAD_OFFICE", label: "Head Office" },
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
  const { isOrgAdmin } = useAuth();
  const createOffice = useCreateOffice();
  const updateOffice = useUpdateOffice();
  const deleteOffice = useDeleteOffice();
  const { data: stores = [], isLoading: isStoresLoading } = useStores();
  const { data: divisions = [] } = useDivisions();
  const { data: districts = [] } = useDistricts();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [divisionModalOpen, setDivisionModalOpen] = useState(false);
  const [districtModalOpen, setDistrictModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<OfficeType>("DIRECTORATE");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { mode: viewMode, setMode: setViewMode } = useViewMode("offices");
  const pageSearch = usePageSearch();
  const searchTerm = useDeferredValue((pageSearch?.term || "").trim());
  const [tableDisplay, setTableDisplay] = useState<{
    filteredCount: number;
    totalPages: number;
    rangeStart: number;
    rangeEnd: number;
  } | null>(null);
  const { data: officesResponse, isLoading } = useOffices({
    type: activeTab,
    search: searchTerm || undefined,
  });
  const visibleOffices = officesResponse || [];
  const pagedOffices = visibleOffices.slice((page - 1) * pageSize, page * pageSize);
  const totalOffices = visibleOffices.length;
  const totalPages = Math.max(1, Math.ceil(totalOffices / pageSize));
  const displayCount = tableDisplay?.filteredCount ?? totalOffices;
  const displayTotalPages = tableDisplay?.totalPages ?? totalPages;
  const displayRangeStart = viewMode === "list"
    ? (tableDisplay?.rangeStart ?? (displayCount === 0 ? 0 : (page - 1) * pageSize + 1))
    : totalOffices === 0 ? 0 : (page - 1) * pageSize + 1;
  const displayRangeEnd = viewMode === "list"
    ? (tableDisplay?.rangeEnd ?? Math.min(page * pageSize, displayCount))
    : Math.min(page * pageSize, totalOffices);
  const systemStores = Array.isArray(stores)
    ? stores.filter((store) => store.is_active !== false)
    : [];
  const divisionCount = divisions.length;
  const districtCount = districts.length;
  const contactableOfficeCount = visibleOffices.filter((office) => Boolean(office.contact_number)).length;

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchTerm]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

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
      setPage(1);
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
      <CollectionWorkspace
        title="Offices"
        description="Manage all offices, divisions, and districts"
        action={{ label: "Add Office", onClick: handleAddOffice }}
        eyebrow="Location workspace"
        meta={
          <>
            <span>{totalOffices} offices in the active tab</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{officeTypeLabel(activeTab)} management</span>
          </>
        }
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
        metrics={[
          { label: "Visible offices", value: totalOffices, helper: "Current tab result count", icon: MapPin, tone: "primary" },
          { label: "Divisions", value: divisionCount, helper: "Reference divisions available for assignment", icon: Pencil, tone: "success" },
          { label: "Districts", value: districtCount, helper: "Reference districts available for assignment", icon: Trash2 },
          { label: "Contactable", value: contactableOfficeCount, helper: "Offices with a contact number on file", icon: Phone, tone: "warning" },
        ]}
        filterBar={
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as OfficeType)}>
            <TabsList className="w-full justify-start overflow-x-auto whitespace-nowrap">
              {OFFICE_VIEW_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        panelTitle="Office network"
        panelDescription="Work through office records, manage the active office tier, and keep supporting geographic references aligned in the same workspace."
      >
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">System Locations</h2>
                <p className="text-sm text-muted-foreground">
                  Central Store is managed separately from offices and is used for store transfer flows.
                </p>
              </div>
              <Badge variant="outline">Read Only</Badge>
            </div>
            {isStoresLoading ? (
              <p className="text-sm text-muted-foreground">Loading system locations...</p>
            ) : systemStores.length === 0 ? (
              <p className="text-sm text-muted-foreground">No system stores available.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {systemStores.map((store) => (
                  <Card key={store.id} className="border-dashed shadow-none">
                    <CardContent className="p-5">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                          <MapPin className="h-6 w-6 text-primary" />
                        </div>
                        <Badge variant="secondary">{store.is_system ? "System Store" : "Store"}</Badge>
                      </div>
                      <h3 className="mb-1 text-lg font-semibold">{store.name}</h3>
                      <p className="text-sm text-muted-foreground">Code: {store.code}</p>
                      <p className="mt-3 text-sm text-muted-foreground">
                        This location is auto-managed by the inventory and transfer workflows.
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {viewMode === "list" ? (
          <DataTable
            columns={columns}
            data={visibleOffices}
            pagination={false}
            externalPage={page}
            pageSize={pageSize}
            searchable={false}
            useGlobalPageSearch={false}
            actions={actions}
            pageSizeOptions={[10, 20, 50, 100]}
            onExternalPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            onDisplayStateChange={setTableDisplay}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {pagedOffices.map((office) => (
                <Card key={office.id} className="group hover:shadow-md transition-all animate-fade-in">
                  <CardContent className="p-6">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <MapPin className="h-6 w-6 text-primary" />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100">
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

                    <h3 className="mb-1 text-lg font-semibold">{office.name}</h3>
                    <Badge variant="outline" className="mb-2">{officeTypeLabel(office.type)}</Badge>
                    <p className="mb-2 text-sm text-muted-foreground">{office.division || "Division not set"}</p>
                    <p className="mb-4 text-sm text-muted-foreground">{office.district || "District not set"}</p>
                    <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{office.address || "No address"}</p>

                    <div className="flex items-center gap-2 border-t pt-4">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{office.contact_number || "No contact"}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {pagedOffices.length === 0 && (
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
            Showing {displayRangeStart} to {displayRangeEnd} of {viewMode === "list" ? displayCount : totalOffices} offices
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              Previous
            </Button>
            <span className="text-sm font-medium">
              Page {page} of {viewMode === "list" ? displayTotalPages : totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((current) => Math.min(viewMode === "list" ? displayTotalPages : totalPages, current + 1))}
              disabled={page >= (viewMode === "list" ? displayTotalPages : totalPages)}
            >
              Next
            </Button>
          </div>
        </div>
      </CollectionWorkspace>

      <OfficeFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        office={editingOffice}
        divisions={divisions}
        districts={districts}
        defaultType={activeTab}
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
