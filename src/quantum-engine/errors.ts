export class QuantumContradiction extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'QuantumContradiction';
    }
}

export class InvalidMove extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidMove';
    }
}

export class PieceCountExceeded extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PieceCountExceeded';
    }
}

export class InvalidState extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidState';
    }
}
