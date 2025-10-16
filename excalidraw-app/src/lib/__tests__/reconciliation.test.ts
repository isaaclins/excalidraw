import { describe, it, expect } from 'vitest';
import { reconcileElements, BroadcastedExcalidrawElement } from '../reconciliation';

describe('reconcileElements', () => {
  const createMockElement = (
    id: string,
    version = 1,
    versionNonce = 1,
    preceding?: string
  ): BroadcastedExcalidrawElement => {
    const element: any = {
      id,
      version,
      versionNonce,
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    if (preceding !== undefined) {
      element['::preceding_element_key'] = preceding;
    }
    return element;
  };

  const createAppState = (
    editingId?: string,
    resizingId?: string,
    draggingId?: string
  ) => ({
    editingElement: editingId ? { id: editingId } : null,
    resizingElement: resizingId ? { id: resizingId } : null,
    draggingElement: draggingId ? { id: draggingId } : null,
  });

  describe('basic reconciliation', () => {
    it('should keep local elements when remote is empty', () => {
      const local = [createMockElement('1'), createMockElement('2')];
      const remote: BroadcastedExcalidrawElement[] = [];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('should add remote elements when local is empty', () => {
      const local: BroadcastedExcalidrawElement[] = [];
      const remote = [createMockElement('1'), createMockElement('2')];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('should merge local and remote elements', () => {
      const local = [createMockElement('1'), createMockElement('2')];
      const remote = [createMockElement('3'), createMockElement('4')];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result).toHaveLength(4);
      expect(result.map(e => e.id)).toContain('1');
      expect(result.map(e => e.id)).toContain('2');
      expect(result.map(e => e.id)).toContain('3');
      expect(result.map(e => e.id)).toContain('4');
    });
  });

  describe('version conflict resolution', () => {
    it('should prefer local element with higher version', () => {
      const local = [createMockElement('1', 5)];
      const remote = [createMockElement('1', 3)];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe(5);
    });

    it('should prefer remote element with higher version', () => {
      const local = [createMockElement('1', 3)];
      const remote = [createMockElement('1', 5)];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe(5);
    });

    it('should use versionNonce for same version (lower nonce wins)', () => {
      const localElement = createMockElement('1', 5, 50);
      const remoteElement = createMockElement('1', 5, 100);
      const appState = createAppState();

      const result = reconcileElements([localElement], [remoteElement], appState);

      expect(result).toHaveLength(1);
      expect(result[0].versionNonce).toBe(50); // Local has lower nonce, so it wins
    });

    it('should use versionNonce for same version (higher nonce loses)', () => {
      const localElement = createMockElement('1', 5, 50);
      const remoteElement = createMockElement('1', 5, 100);
      const appState = createAppState();

      const result = reconcileElements([localElement], [remoteElement], appState);

      expect(result).toHaveLength(1);
      expect(result[0].versionNonce).toBe(50); // Local has lower nonce
    });
  });

  describe('editing state protection', () => {
    it('should protect element being edited', () => {
      const localElement = createMockElement('1', 3);
      const remoteElement = createMockElement('1', 5);
      const appState = createAppState('1'); // Editing element 1

      const result = reconcileElements([localElement], [remoteElement], appState);

      expect(result[0].version).toBe(3); // Keep local version
    });

    it('should protect element being resized', () => {
      const localElement = createMockElement('1', 3);
      const remoteElement = createMockElement('1', 5);
      const appState = createAppState(undefined, '1'); // Resizing element 1

      const result = reconcileElements([localElement], [remoteElement], appState);

      expect(result[0].version).toBe(3); // Keep local version
    });

    it('should protect element being dragged', () => {
      const localElement = createMockElement('1', 3);
      const remoteElement = createMockElement('1', 5);
      const appState = createAppState(undefined, undefined, '1'); // Dragging element 1

      const result = reconcileElements([localElement], [remoteElement], appState);

      expect(result[0].version).toBe(3); // Keep local version
    });

    it('should not protect non-active elements', () => {
      const localElement = createMockElement('1', 3);
      const remoteElement = createMockElement('1', 5);
      const appState = createAppState('2'); // Editing different element

      const result = reconcileElements([localElement], [remoteElement], appState);

      expect(result[0].version).toBe(5); // Accept remote version
    });
  });

  describe('element ordering with preceding_element_key', () => {
    it('should insert at beginning with ^ marker', () => {
      const local = [createMockElement('1'), createMockElement('2')];
      const remote = [createMockElement('0', 1, 1, '^')];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result[0].id).toBe('0');
      expect(result[1].id).toBe('1');
      expect(result[2].id).toBe('2');
    });

    it('should insert after specified element', () => {
      const local = [createMockElement('1'), createMockElement('3')];
      const remote = [createMockElement('2', 1, 1, '1')];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
      expect(result[2].id).toBe('3');
    });

    it('should handle multiple inserts with ordering', () => {
      const local = [createMockElement('1'), createMockElement('4')];
      const remote = [
        createMockElement('2', 1, 1, '1'),
        createMockElement('3', 1, 1, '2'),
      ];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result.map(e => e.id)).toEqual(['1', '2', '3', '4']);
    });

    it('should append when parent not found', () => {
      const local = [createMockElement('1'), createMockElement('2')];
      const remote = [createMockElement('3', 1, 1, 'nonexistent')];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result[2].id).toBe('3'); // Appended to end
    });

    it('should remove preceding_element_key after processing', () => {
      const local = [createMockElement('1')];
      const remote = [createMockElement('2', 1, 1, '^')];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result[0]['::preceding_element_key']).toBeUndefined();
    });

    it('should use previous element as parent when no preceding key', () => {
      const local = [createMockElement('1')];
      const remote = [
        createMockElement('2'),
        createMockElement('3'), // Should come after '2'
      ];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result.map(e => e.id)).toContain('2');
      expect(result.map(e => e.id)).toContain('3');
    });
  });

  describe('duplicate removal', () => {
    it('should remove duplicate local elements when replaced', () => {
      const localElement = createMockElement('1', 3);
      const remoteElement = createMockElement('1', 5);
      const appState = createAppState();

      const result = reconcileElements([localElement], [remoteElement], appState);

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe(5);
    });

    it('should handle multiple duplicates', () => {
      const local = [
        createMockElement('1', 1),
        createMockElement('2', 1),
        createMockElement('3', 1),
      ];
      const remote = [
        createMockElement('1', 2),
        createMockElement('2', 2),
        createMockElement('3', 2),
      ];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result).toHaveLength(3);
      expect(result[0].version).toBe(2);
      expect(result[1].version).toBe(2);
      expect(result[2].version).toBe(2);
    });

    it('should not treat same object reference as duplicate', () => {
      const sharedElement = createMockElement('1', 5);
      const local = [sharedElement];
      const remote = [sharedElement];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(sharedElement);
    });
  });

  describe('complex scenarios', () => {
    it('should handle concurrent edits from multiple users', () => {
      const local = [
        createMockElement('1', 5),
        createMockElement('2', 3),
        createMockElement('3', 7),
      ];
      const remote = [
        createMockElement('1', 6), // Remote wins
        createMockElement('2', 2), // Local wins
        createMockElement('4', 1), // New element
      ];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result.find(e => e.id === '1')?.version).toBe(6);
      expect(result.find(e => e.id === '2')?.version).toBe(3);
      expect(result.find(e => e.id === '3')?.version).toBe(7);
      expect(result.find(e => e.id === '4')?.version).toBe(1);
    });

    it('should handle z-index reordering', () => {
      const local = [
        createMockElement('1'),
        createMockElement('2'),
        createMockElement('3'),
      ];
      const remote = [
        createMockElement('3', 2, 1, '^'), // Move 3 to front
        createMockElement('1', 2),
        createMockElement('2', 2),
      ];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result[0].id).toBe('3'); // Should be first
    });

    it('should handle deleted elements (not in remote)', () => {
      const local = [
        createMockElement('1'),
        createMockElement('2'),
        createMockElement('3'),
      ];
      const remote = [
        createMockElement('1', 2),
        createMockElement('3', 2),
        // '2' is deleted
      ];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      // All local elements should remain unless explicitly replaced
      expect(result.find(e => e.id === '2')).toBeDefined();
    });

    it('should handle empty remote and local arrays', () => {
      const local: BroadcastedExcalidrawElement[] = [];
      const remote: BroadcastedExcalidrawElement[] = [];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result).toHaveLength(0);
    });

    it('should handle insertion in middle of array', () => {
      const local = [
        createMockElement('1'),
        createMockElement('3'),
        createMockElement('5'),
      ];
      const remote = [
        createMockElement('2', 1, 1, '1'),
        createMockElement('4', 1, 1, '3'),
      ];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result.map(e => e.id)).toEqual(['1', '2', '3', '4', '5']);
    });
  });

  describe('edge cases', () => {
    it('should handle null appState properties', () => {
      const local = [createMockElement('1', 3)];
      const remote = [createMockElement('1', 5)];
      const appState = {
        editingElement: null,
        resizingElement: null,
        draggingElement: null,
      };

      const result = reconcileElements(local, remote, appState);

      expect(result[0].version).toBe(5);
    });

    it('should handle undefined appState properties', () => {
      const local = [createMockElement('1', 3)];
      const remote = [createMockElement('1', 5)];
      const appState = {};

      const result = reconcileElements(local, remote, appState);

      expect(result[0].version).toBe(5);
    });

    it('should handle very large arrays', () => {
      const local = Array.from({ length: 1000 }, (_, i) =>
        createMockElement(`local-${i}`)
      );
      const remote = Array.from({ length: 1000 }, (_, i) =>
        createMockElement(`remote-${i}`)
      );
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result.length).toBeGreaterThan(1000);
    });

    it('should handle same version and nonce (deterministic)', () => {
      const localElement = createMockElement('1', 5, 100);
      const remoteElement = createMockElement('1', 5, 100);
      const appState = createAppState();

      const result = reconcileElements([localElement], [remoteElement], appState);

      expect(result).toHaveLength(1);
      // Should consistently pick one (local in this case due to nonce tie)
      expect(result[0].versionNonce).toBe(100);
    });

    it('should handle backward insertion (parent before cursor)', () => {
      const local = [
        createMockElement('1'),
        createMockElement('2'),
        createMockElement('3'),
      ];
      const remote = [
        createMockElement('4', 1, 1, '3'),
        createMockElement('5', 1, 1, '1'), // Insert backwards
      ];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result.length).toBeGreaterThan(3);
    });

    it('should handle chain of preceding elements', () => {
      const local = [createMockElement('1')];
      const remote = [
        createMockElement('2', 1, 1, '1'),
        createMockElement('3', 1, 1, '2'),
        createMockElement('4', 1, 1, '3'),
      ];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result.map(e => e.id)).toEqual(['1', '2', '3', '4']);
    });

    it('should preserve element properties other than version', () => {
      const local = [
        {
          ...createMockElement('1', 3),
          customProp: 'local-value',
        },
      ];
      const remote = [
        {
          ...createMockElement('1', 5),
          customProp: 'remote-value',
        },
      ];
      const appState = createAppState();

      const result = reconcileElements(local, remote, appState);

      expect(result[0].customProp).toBe('remote-value');
    });
  });
});

