import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { requisitionService } from "@/services/requisitionService";
import type { RequisitionCreateLineInput } from "@/services/requisitionService";
import { officeSubLocationService } from "@/services/officeSubLocationService";
import { useEmployees } from "@/hooks/useEmployees";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";

type DraftLine = {
  line_type: "MOVEABLE" | "CONSUMABLE";
  requested_name: string;
  requested_quantity: number;
  notes: string;
};

const DEFAULT_LINE: DraftLine = {
  line_type: "MOVEABLE",
  requested_name: "",
  requested_quantity: 1,
  notes: "",
};

const ALLOWED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

function isAllowedAttachment(file: File) {
  if (ALLOWED_FILE_TYPES.has(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

export default function RequisitionNew() {
  const navigate = useNavigate();
  const { user, role, locationId } = useAuth();
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: locations } = useLocations();
  const roomsQuery = useQuery({
    queryKey: ["office-sub-locations", locationId],
    queryFn: () => officeSubLocationService.list({ officeId: locationId || undefined }),
    enabled: Boolean(locationId),
  });

  const [fileNumber, setFileNumber] = useState("");
  const [targetType, setTargetType] = useState<"EMPLOYEE" | "SUB_LOCATION">("EMPLOYEE");
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [targetSubLocationId, setTargetSubLocationId] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...DEFAULT_LINE }]);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employeeDefaultResolved, setEmployeeDefaultResolved] = useState(false);

  const employeeList = useMemo(() => employees || [], [employees]);
  const locationList = useMemo(() => locations || [], [locations]);
  const officeName = useMemo(() => {
    const office = locationList.find((entry) => entry.id === locationId);
    return office?.name || locationId || "Unassigned Office";
  }, [locationList, locationId]);

  const officeEmployees = useMemo(() => {
    if (!locationId) return [];
    return employeeList.filter((employee) => employee.location_id === locationId);
  }, [employeeList, locationId]);
  const roomList = useMemo(() => roomsQuery.data || [], [roomsQuery.data]);

  const filteredOfficeEmployees = useMemo(() => {
    const token = employeeSearch.trim().toLowerCase();
    if (!token) return officeEmployees;
    return officeEmployees.filter((employee) =>
      `${employee.first_name} ${employee.last_name} ${employee.email}`.toLowerCase().includes(token)
    );
  }, [officeEmployees, employeeSearch]);

  const filteredRooms = useMemo(() => {
    const token = roomSearch.trim().toLowerCase();
    if (!token) return roomList;
    return roomList.filter((room) => room.name.toLowerCase().includes(token));
  }, [roomList, roomSearch]);

  useEffect(() => {
    if (employeeDefaultResolved || role !== "employee") return;
    const currentUserId = user?.id || "";
    const currentUserEmail = (user?.email || "").toLowerCase();
    const byUserId = officeEmployees.find((employee) => employee.user_id === currentUserId);
    const byEmail = officeEmployees.find((employee) => employee.email?.toLowerCase() === currentUserEmail);
    const mapped = byUserId || byEmail;
    if (mapped?.id) {
      setTargetType("EMPLOYEE");
      setTargetEmployeeId(mapped.id);
    }
    setEmployeeDefaultResolved(true);
  }, [employeeDefaultResolved, role, user?.id, user?.email, officeEmployees]);

  const addLine = () => {
    setLines((previous) => [...previous, { ...DEFAULT_LINE }]);
  };

  const removeLine = (index: number) => {
    setLines((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateLine = <K extends keyof DraftLine>(index: number, key: K, value: DraftLine[K]) => {
    setLines((previous) =>
      previous.map((line, currentIndex) => (currentIndex === index ? { ...line, [key]: value } : line))
    );
  };

  const validate = () => {
    const errors: string[] = [];
    if (!locationId) {
      errors.push("Your account is not assigned to an office.");
    }
    if (!fileNumber.trim()) {
      errors.push("File number is required.");
    }
    if (!attachment) {
      errors.push("Attachment is required.");
    } else if (!isAllowedAttachment(attachment)) {
      errors.push("Attachment must be a PDF, JPG, or PNG file.");
    }
    if (lines.length < 1) {
      errors.push("At least one line item is required.");
    }
    lines.forEach((line, index) => {
      if (!line.requested_name.trim()) {
        errors.push(`Line ${index + 1}: requested name is required.`);
      }
      const quantity = Number(line.requested_quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push(`Line ${index + 1}: requested quantity must be greater than 0.`);
      }
    });
    if (targetType === "EMPLOYEE") {
      if (!targetEmployeeId) {
        errors.push("Select target employee.");
      } else if (!officeEmployees.some((employee) => employee.id === targetEmployeeId)) {
        errors.push("Selected target employee is not valid for your office.");
      }
    } else {
      if (!targetSubLocationId) {
        errors.push("Select target room.");
      } else if (!roomList.some((room) => (room.id || room._id) === targetSubLocationId)) {
        errors.push("Selected target room is not valid for your office.");
      }
    }
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !locationId || !attachment) return;
    const targetId = targetType === "EMPLOYEE" ? targetEmployeeId : targetSubLocationId;
    if (!targetId) return;

    const payloadLines: RequisitionCreateLineInput[] = lines.map((line) => ({
      line_type: line.line_type,
      requested_name: line.requested_name.trim(),
      requested_quantity: Number(line.requested_quantity || 1),
      notes: line.notes.trim() || undefined,
    }));

    setIsSubmitting(true);
    try {
      const created = await requisitionService.create({
        file_number: fileNumber.trim(),
        office_id: locationId,
        target_type: targetType,
        target_id: targetId,
        lines: payloadLines,
        requisition_file: attachment,
      });

      const requisitionId = created.requisition.id || created.requisition._id;
      if (!requisitionId) {
        throw new Error("Requisition was created but no ID was returned.");
      }
      toast.success("Requisition submitted successfully.");
      navigate(`/requisitions/${requisitionId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit requisition.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MainLayout title="New Requisition" description="Create and submit a requisition form">
      <PageHeader
        title="New Requisition"
        description="Submit a requisition with line items and an attached signed form."
      />

      <div className="mt-6 space-y-6">
        {validationErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Please fix the following issues</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {validationErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Requisition Header</CardTitle>
            <CardDescription>File details and office scope for this request.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fileNumber">File Number *</Label>
                <Input
                  id="fileNumber"
                  value={fileNumber}
                  onChange={(event) => setFileNumber(event.target.value)}
                  placeholder="e.g. REQ/HQ/2026-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="office">Office</Label>
                <Input id="office" value={officeName} disabled readOnly />
                <p className="text-xs text-muted-foreground">
                  Office is auto-selected from your account and cannot be changed.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <Label>Requisition Target *</Label>
              <RadioGroup
                value={targetType}
                onValueChange={(value) => setTargetType(value as "EMPLOYEE" | "SUB_LOCATION")}
                className="grid gap-2 md:grid-cols-2"
              >
                <label className="flex items-center gap-2 rounded border p-2">
                  <RadioGroupItem id="target-employee" value="EMPLOYEE" />
                  <span className="text-sm font-medium">Employee</span>
                </label>
                <label className="flex items-center gap-2 rounded border p-2">
                  <RadioGroupItem id="target-room" value="SUB_LOCATION" />
                  <span className="text-sm font-medium">Room</span>
                </label>
              </RadioGroup>

              {targetType === "EMPLOYEE" ? (
                <div className="space-y-2">
                  <Label htmlFor="employeeSearch">Employee Search</Label>
                  <Input
                    id="employeeSearch"
                    value={employeeSearch}
                    onChange={(event) => setEmployeeSearch(event.target.value)}
                    placeholder="Type employee name or email"
                  />
                  <Select
                    value={targetEmployeeId || undefined}
                    onValueChange={(value) => setTargetEmployeeId(value)}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={employeesLoading ? "Loading employees..." : "Select target employee"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredOfficeEmployees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.first_name} {employee.last_name} ({employee.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="roomSearch">Room Search</Label>
                  <Input
                    id="roomSearch"
                    value={roomSearch}
                    onChange={(event) => setRoomSearch(event.target.value)}
                    placeholder="Type room name"
                  />
                  <Select
                    value={targetSubLocationId || undefined}
                    onValueChange={(value) => setTargetSubLocationId(value)}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={roomsQuery.isLoading ? "Loading rooms..." : "Select target room"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredRooms.map((room) => {
                        const roomId = room.id || room._id || "";
                        return (
                          <SelectItem key={roomId} value={roomId}>
                            {room.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="attachment">Attachment (PDF/JPG/PNG) *</Label>
              <Input
                id="attachment"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => setAttachment(event.target.files?.[0] || null)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
            <CardDescription>Add one or more requested items.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.map((line, index) => (
              <div key={`line-${index}`} className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Line {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(index)}
                    disabled={lines.length === 1}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Line Type</Label>
                    <Select
                      value={line.line_type}
                      onValueChange={(value) =>
                        updateLine(index, "line_type", value as "MOVEABLE" | "CONSUMABLE")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MOVEABLE">MOVEABLE</SelectItem>
                        <SelectItem value="CONSUMABLE">CONSUMABLE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Requested Name *</Label>
                    <Input
                      value={line.requested_name}
                      onChange={(event) => updateLine(index, "requested_name", event.target.value)}
                      placeholder="e.g. Laptop, Printer Ink"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Requested Quantity *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={line.requested_quantity}
                      onChange={(event) =>
                        updateLine(index, "requested_quantity", Number(event.target.value || 1))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={line.notes}
                    onChange={(event) => updateLine(index, "notes", event.target.value)}
                    placeholder="Optional notes"
                    rows={2}
                  />
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" onClick={addLine}>
              <Plus className="mr-2 h-4 w-4" />
              Add Line
            </Button>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Requisition
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
