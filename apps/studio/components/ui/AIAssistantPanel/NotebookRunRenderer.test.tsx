import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { NotebookRunRenderer } from './NotebookRunRenderer'
import type { components } from '@/data/api'
import { customRender as render } from '@/tests/lib/custom-render'
import { addAPIMock } from '@/tests/lib/msw'

const NOTEBOOK_ID = 'd3aadd77-7c3c-4de7-aa5c-5aa8ac270b44'
const UPDATED_AT = '2026-01-01T00:00:00.000Z'

const mockNotebook = (updatedAt = UPDATED_AT) =>
  addAPIMock({
    method: 'get',
    path: '/platform/projects/:ref/content/item/:id',
    response: () =>
      HttpResponse.json<components['schemas']['GetUserContentByIdResponse']>({
        id: NOTEBOOK_ID,
        type: 'notebook',
        name: 'Signup funnel',
        description: '',
        favorite: false,
        folder_id: null,
        inserted_at: UPDATED_AT,
        updated_at: updatedAt,
        visibility: 'project',
        owner_id: 1,
        project_id: 1,
        content: {
          schema_version: 1,
          cells: [
            {
              _tag: 'database_cell',
              _id: 'cell-1',
              title: 'Recent signups',
              sql: 'select email from auth.users',
              row_limit: 100,
            },
          ],
        },
      } as unknown as components['schemas']['GetUserContentByIdResponse']),
  })

describe('NotebookRunRenderer', () => {
  it('previews the notebook and requests one Run notebook approval', async () => {
    const user = userEvent.setup()
    const onApprove = vi.fn()
    mockNotebook()

    render(
      <NotebookRunRenderer
        state="approval-requested"
        confirmState="approval-requested"
        input={{ id: NOTEBOOK_ID, expected_updated_at: UPDATED_AT }}
        output={undefined}
        onApprove={onApprove}
        onDeny={vi.fn()}
      />
    )

    expect(await screen.findByText('Assistant wants to run "Signup funnel"')).toBeInTheDocument()
    expect(screen.getByText('1 cell')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Run notebook' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('keeps raw results visible to the user after execution', async () => {
    mockNotebook()

    render(
      <NotebookRunRenderer
        state="output-available"
        confirmState="success"
        input={{ id: NOTEBOOK_ID, expected_updated_at: UPDATED_AT }}
        output={{
          id: NOTEBOOK_ID,
          name: 'Signup funnel',
          updated_at: UPDATED_AT,
          cells: [
            {
              cell_id: 'cell-1',
              title: 'Recent signups',
              source: 'database',
              status: 'success',
              rows: [{ email: 'person@example.com' }],
            },
          ],
        }}
      />
    )

    expect(await screen.findByText('Notebook executed')).toBeInTheDocument()
    expect(screen.getByText('1 row')).toBeInTheDocument()
    expect(screen.getByText(/person@example\.com/)).toBeInTheDocument()
  })

  it('warns before approval when the notebook changed since the Assistant read it', async () => {
    mockNotebook('2026-01-02T00:00:00.000Z')

    render(
      <NotebookRunRenderer
        state="approval-requested"
        confirmState="approval-requested"
        input={{ id: NOTEBOOK_ID, expected_updated_at: UPDATED_AT }}
        output={undefined}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />
    )

    expect(
      await screen.findByText('Notebook changed since the Assistant read it')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run notebook' })).toBeInTheDocument()
  })

  it('warns when historical results are shown with a newer notebook', async () => {
    mockNotebook('2026-01-02T00:00:00.000Z')

    render(
      <NotebookRunRenderer
        state="output-available"
        confirmState="success"
        input={{ id: NOTEBOOK_ID, expected_updated_at: UPDATED_AT }}
        output={{
          id: NOTEBOOK_ID,
          name: 'Signup funnel',
          updated_at: UPDATED_AT,
          cells: [
            {
              cell_id: 'cell-1',
              title: 'Recent signups',
              source: 'database',
              status: 'success',
              rows: [{ email: 'person@example.com' }],
            },
          ],
        }}
      />
    )

    expect(await screen.findByText('Notebook changed since this run')).toBeInTheDocument()
    expect(screen.getByText(/preview shows the current notebook/i)).toBeInTheDocument()
  })
})
