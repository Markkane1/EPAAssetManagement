import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db';
import { AssignmentModel } from '../src/models/assignment.model';
import { RequisitionModel } from '../src/models/requisition.model';
import { UserModel } from '../src/models/user.model';
import { generateHandoverSlip, generateReturnSlip } from '../src/services/assignmentSlip.service';

const ASSIGNMENT_ID_PLACEHOLDER = 'PUT_REAL_ASSIGNMENT_ID_HERE';
const ASSIGNMENT_ID = String(process.env.ASSIGNMENT_ID || ASSIGNMENT_ID_PLACEHOLDER).trim();

async function resolveGeneratedByUserId(assignment: {
  issued_by_user_id?: mongoose.Types.ObjectId | null;
  requisition_id?: mongoose.Types.ObjectId | null;
}) {
  const envValue = String(process.env.GENERATED_BY_USER_ID || '').trim();
  if (envValue) return envValue;

  if (assignment.issued_by_user_id) {
    return String(assignment.issued_by_user_id);
  }

  if (assignment.requisition_id) {
    const requisition = await RequisitionModel.findById(assignment.requisition_id, { submitted_by_user_id: 1 }).lean();
    if (requisition?.submitted_by_user_id) {
      return String(requisition.submitted_by_user_id);
    }
  }

  const fallbackUser = await UserModel.findOne({}, { _id: 1 }).sort({ created_at: 1 }).lean();
  if (fallbackUser?._id) {
    return String(fallbackUser._id);
  }

  return '';
}

async function run() {
  if (!ASSIGNMENT_ID || ASSIGNMENT_ID === ASSIGNMENT_ID_PLACEHOLDER) {
    console.log('set ASSIGNMENT_ID env var');
    return;
  }

  try {
    await connectDatabase();

    const assignment = await AssignmentModel.findById(ASSIGNMENT_ID, {
      issued_by_user_id: 1,
      requisition_id: 1,
    }).lean();

    if (!assignment) {
      console.error(`Assignment not found: ${ASSIGNMENT_ID}`);
      process.exitCode = 1;
      return;
    }

    const generatedByUserId = await resolveGeneratedByUserId(assignment);
    if (!generatedByUserId) {
      console.error('No user id available. Set GENERATED_BY_USER_ID env var.');
      process.exitCode = 1;
      return;
    }

    const handover = await generateHandoverSlip({
      assignmentId: ASSIGNMENT_ID,
      generatedByUserId,
    });
    console.log(`handover_document_id=${handover.documentId} handover_version_id=${handover.versionId}`);

    const returnSlip = await generateReturnSlip({
      assignmentId: ASSIGNMENT_ID,
      generatedByUserId,
    });
    console.log(`return_document_id=${returnSlip.documentId} return_version_id=${returnSlip.versionId}`);
  } catch (error) {
    console.error('Failed to generate assignment slips:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

run();
